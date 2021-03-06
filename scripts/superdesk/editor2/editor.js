/**
 * This file is part of Superdesk.
 *
 * Copyright 2013, 2014 Sourcefabric z.u. and contributors.
 *
 * For the full copyright and license information, please see the
 * AUTHORS and LICENSE files distributed with this source code, or
 * at https://www.sourcefabric.org/superdesk/license
 */
import MediumEditor from 'medium-editor';
import MediumEditorTable from 'medium-editor-tables';

import './customAnchor';

var TYPING_CLASS = 'typing';

/**
 * History stack
 *
 * It supports undo/redo operations
 *
 * @param {string} initialValue
 */
function HistoryStack(initialValue) {
    var stack = [];
    var index = -1;

    /**
     * Add a new value to stack and remove all furhter redo values
     * so after manual change there is no way to redo.
     *
     * @param {string} value
     */
    this.add = function(value) {
        index = index + 1;
        stack[index] = value;
        stack.splice(index + 1, stack.length);
    };

    /**
     * Select previous value (undo)
     */
    this.selectPrev = function() {
        index = Math.max(-1, index - 1);
    };

    /**
     * Select next value (redo)
     */
    this.selectNext = function() {
        index = stack[index + 1] != null ? index + 1 : index;
    };

    /**
     * Get current value
     */
    this.get = function() {
        var state = index > -1 ? stack[index] : initialValue;
        return state;
    };

    /**
     * Get current index
     *
     * @return {Number}
     */
    this.getIndex = function() {
        return index;
    };
}

/**
 * Escape given string for reg exp
 *
 * @url https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
 *
 * @param {string} string
 * @return {string}
 */
function escapeRegExp(string){
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

EditorService.$inject = ['spellcheck', '$q', 'lodash', 'renditions', 'editorUtils'];
function EditorService(spellcheck, $q, _, renditionsService, utils) {

    this.settings = {spellcheck: true};

    /**
     * mock spellcheck integration
     */
    this.countErrors = function() {
        return $q.when(0);
    };

    this.KEY_CODES = Object.freeze({
        Y: 'Y'.charCodeAt(0),
        Z: 'Z'.charCodeAt(0),
        UP: 38,
        DOWN: 40,
        F3: 114
    });

    this.ARROWS = Object.freeze({
        33: 1, // page up
        34: 1, // page down
        35: 1, // end
        36: 1, // home
        37: 1, // left
        38: 1, // up
        39: 1, // right
        40: 1  // down
    });

    this.META = Object.freeze({
        16: 1, // shift
        17: 1, // ctrl
        18: 1, // alt
        20: 1, // caps lock
        91: 1, // left meta in webkit
        93: 1, // right meta in webkit
        224: 1 // meta in firefox
    });

    /**
     * Test if given keyboard event should be ignored as it's not changing content.
     *
     * @param {Event} event
     * @return {boolen}
     */
    this.shouldIgnore = function (event) {
        // ignore arrows
        if (self.ARROWS[event.keyCode]) {
            return true;
        }

        // ignore meta keys (ctrl, shift or meta only)
        if (self.META[event.keyCode]) {
            return true;
        }

        // ignore shift + ctrl/meta + something
        if (event.shiftKey && (event.ctrlKey || event.metaKey)) {
            return true;
        }

        return false;
    };

    var ERROR_CLASS = 'sderror';
    var HILITE_CLASS = 'sdhilite';
    var ACTIVE_CLASS = 'sdactive';
    var FINDREPLACE_CLASS = 'sdfindreplace';

    var self = this;
    var scopes = [];

    /**
     * Register given scope - it adds history stack to it and keeps reference
     *
     * @param {Scope} scope
     */
    this.registerScope = function(scope) {
        scopes.push(scope);
        scope.history = new HistoryStack(scope.model.$viewValue || '');
        scope.$on('$destroy', function() {
            var index = scopes.indexOf(scope);
            scopes.splice(index, 1);
        });
    };

    /**
     * Render highlights for given scope based on settings
     *
     * @param {Scope} scope
     * @param {Scope} force force rendering manually - eg. via keyboard
     */
    this.renderScope = function(scope, force, preventStore) {
        if (self.settings.findreplace) {
            renderFindreplace(scope.node);
        } else if (self.settings.spellcheck || force) {
            renderSpellcheck(scope.node, preventStore);
        } else {
            utils.removeHilites(scope.node);
        }
    };

    /**
     * Render highlights in all registered scopes
     *
     * @param {Boolean} force rendering
     */
    this.render = function(force) {
        scopes.forEach(function(scope) {
            self.renderScope(scope, force);
        });
    };

    /**
     * Highlight find&replace matches in given node
     *
     * @param {Node} node
     */
    function renderFindreplace(node) {
        var tokens = utils.getFindReplaceTokens(node, self.settings);
        utils.hilite(node, tokens, FINDREPLACE_CLASS);
    }

    /**
     * Highlight spellcheck errors in given node
     *
     * @param {Node} node
     */
    function renderSpellcheck(node, preventStore) {
        spellcheck.errors(node).then(function(tokens) {
            utils.hilite(node, tokens, ERROR_CLASS, preventStore);
        });
    }

    /**
     * Set next highlighted node active.
     *
     * In case there is no node selected select first one.
     */
    this.selectNext = function() {
        var nodes = document.body.getElementsByClassName(HILITE_CLASS);

        for (var i = 0; i < nodes.length; i++) {
            var node = nodes.item(i);
            if (node.classList.contains(ACTIVE_CLASS)) {
                node.classList.remove(ACTIVE_CLASS);
                nodes.item((i + 1) % nodes.length).classList.add(ACTIVE_CLASS);
                return node;
            }
        }

        if (nodes.length) {
            nodes.item(0).classList.add(ACTIVE_CLASS);
        }
    };

    /**
     * Set previous highlighted node active.
     */
    this.selectPrev = function() {
        var nodes = document.body.getElementsByClassName(HILITE_CLASS);
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes.item(i);
            if (node.classList.contains(ACTIVE_CLASS)) {
                node.classList.remove(ACTIVE_CLASS);
                nodes.item(i === 0 ? nodes.length - 1 : i - 1).classList.add(ACTIVE_CLASS);
                return;
            }
        }
    };

    function replaceText(scope, text, className) {
        if (!className) {
            className = ACTIVE_CLASS;
        }
        var nodes = scope.node.parentNode.getElementsByClassName(className);
        var nodesLength = nodes.length;
        var replacementOffset = self.replaceNodes(nodes, text, scope);
        if (replacementOffset && className === ACTIVE_CLASS) {
            updateIndexOnReplace(scope.node, replacementOffset);
        }
        return nodesLength;
    }

    // updates the data-index of remaining find-replace candidates subsequent to just replaced active node
    function updateIndexOnReplace(node, replacementOffset) {
        var nodes = node.parentNode.getElementsByClassName(HILITE_CLASS);
        var nextElem, newIndex, activeIndex;
        for (var i = 0; i < nodes.length; i++) {
            var currentNode = nodes.item(i);
            if (currentNode.classList.contains(ACTIVE_CLASS)) {
                currentNode.classList.remove(FINDREPLACE_CLASS);
                activeIndex = i;
            }
        }

        if (activeIndex != null) {
            for (var j = activeIndex + 1; j < nodes.length; j++) {
                nextElem = nodes.item(j);
                newIndex = parseInt(nextElem.getAttribute('data-index'), 10) + replacementOffset;
                nextElem.setAttribute('data-index', newIndex);
            }
        }
    }

    /**
     * Replace active node with given text.
     *
     * @param {string} text
     */
    this.replace = function(text) {
        scopes.forEach(function(scope) {
            if (replaceText(scope, text)) {
                this.commitScope(scope);
            }
        }.bind(this));
    };

    /**
     * Replace all highlighted nodes with given text.
     *
     * @param {string} text
     */
    this.replaceAll = function(text) {
        scopes.forEach(function(scope) {
            var nodes = scope.node.parentNode.getElementsByClassName(HILITE_CLASS);
            this.replaceNodes(nodes, text, scope);
            this.commitScope(scope);
        }.bind(this));
    };

    /**
     * Replace text at given index with word
     *
     * @param {Object} scope
     * @param {Number} index
     * @param {Number} length
     * @param {String} word
     */
    this.replaceWord = function(scope, index, length, word) {
        var node = scope.node;
        var start = utils.findWordNode(node, index, length);
        var characters = start.node.textContent.split('');
        characters.splice(start.offset, length, word);
        start.node.textContent = characters.join('');
    };

    /**
     * Replace all nodes with text
     *
     * @param {HTMLCollection} nodes
     * @param {string} text
     */
    this.replaceNodes = function(nodes, text, scope) {
        var index, replacementOffset = 0;
        for (var i = 0, l = nodes.length; i < l; i++) {
            var node = nodes.item(i);
            var word = node.dataset.word;
            index = parseInt(node.dataset.index, 10) + replacementOffset;
            this.replaceWord(scope, index, word.length, text);
            replacementOffset += (text.length - word.length);
        }
        return replacementOffset;
    };

    /**
     * Update settings
     *
     * @param {Object} settings
     */
    this.setSettings = function(settings) {
        self.settings = angular.extend({}, self.settings, settings);
    };

    /**
     * Test if given elem is a spellcheck error node
     *
     * @param {Node} elem
     * @return {boolean}
     */
    this.isErrorNode = function(elem) {
        return elem.classList.contains(ERROR_CLASS);
    };

    /**
     * Commit changes in all scopes
     */
    this.commit = function() {
        scopes.forEach(self.commitScope);
    };

    /**
     * Replace abbreviations.
     * @param {Scope} scope
     */
    function replaceAbbreviations (scope) {
        if (!scope.node.parentNode.classList.contains(TYPING_CLASS)) {
            return $q.when({});
        }

        if (scope.node.innerText !== '') {
            return spellcheck.getAbbreviationsDict().then(function(abbreviations) {
                if (_.keys(abbreviations).length) {
                    var pattern = '\\b(' + _.map(_.keys(abbreviations), function(item) {
                            return escapeRegExp(item);
                        }).join('|') + ')(\\*)';
                    var found = scope.node.innerText.match(new RegExp(pattern, 'g'));
                    if (found) {
                        // store old settings
                        var old_settings = angular.extend({}, self.settings);
                        var caretPosition = scope.medium.exportSelection();

                        _.forEach(_.uniq(found), function(val) {
                            var replacementValue = abbreviations[val.replace('*', '')];
                            if (replacementValue) {
                                var diff = {};
                                diff[val] = replacementValue;
                                self.setSettings({findreplace: {diff: diff, caseSensitive: true}});
                                renderFindreplace(scope.node);
                                var nodesLength = replaceText(scope, replacementValue, FINDREPLACE_CLASS);
                                if (nodesLength > 0) {
                                    var incrementCaretPosition = (replacementValue.length - val.length) * nodesLength;
                                    caretPosition.start += incrementCaretPosition;
                                    caretPosition.end += incrementCaretPosition;
                                }
                            }
                        });

                        scope.medium.importSelection(caretPosition);
                        // apply old settings
                        self.setSettings({findreplace: (old_settings.findreplace ? old_settings.findreplace : null)});
                    }
                }
            });
        }

        return $q.when({});
    }

    /**
     * Commit changes in given scope to its model
     *
     * @param {Scope} scope
     */
    this.commitScope = function(scope) {
        replaceAbbreviations(scope).then(function() {
            var nodeValue = scope.node.innerHTML;
            if (nodeValue !== scope.model.$viewValue) {
                scope.model.$setViewValue(nodeValue);
                scope.history.add(scope.model.$viewValue);
            }
        });
    };

    /**
     * Returns the cleaned node text
     *
     * @return {string}
     */
    this.getNodeText = function(scope) {
        return scope.node.innerHTML;
    };

    /**
     * Get active node text
     *
     * @return {string}
     */
    this.getActiveText = function() {
        var active;
        scopes.forEach(function(scope) {
            var nodes = scope.node.parentNode.getElementsByClassName(ACTIVE_CLASS);
            active = nodes.length ? nodes.item(0) : active;
        });

        return active ? active.textContent : null;
    };

    this.generateMediaTag = function(data) {
        var mediaTypes = {
            'video': function() {
                var videoTag = ['<video controls="controls">'];
                angular.forEach(data.renditions, function(rendition, name) {
                    if (_.some(['.mp4', '.webm', '.ogv'], function(ext) {
                        return _.endsWith(rendition.href, ext);
                    })) {
                        videoTag.push('<source src="' + rendition.href + '">');
                    }
                });
                videoTag.push('</video>');
                return videoTag.join('');
            },
            'picture': function() {
                var url = data.url, altText = data.altText;
                var promiseFinished;
                // if this is a SD archive, we use its properties
                if (data._type === 'archive' || data.type === 'picture') {
                    // get expected renditions list
                    promiseFinished = renditionsService.get().then(function(renditionsList) {
                        // ]use the first rendtion as default
                        var firstRendition = data.renditions[renditionsList[0].name];
                        if (angular.isDefined(firstRendition)) {
                            url = firstRendition.href;
                        } else {
                            // use "viewImage" rendition as fallback
                            url = data.renditions.viewImage.href;
                        }
                        // if a `alt_text` exists, otherwise we fill w/ `description_text`
                        altText = data.alt_text || data.description_text;
                        return renditionsList;
                    });
                }
                // when previous promise is finished, compose the html
                return $q.when(promiseFinished, function(renditionsList) {
                    var html = ['<img',
                    'src="' + url + '"',
                    'alt="' + _.escape(altText || '') + '"'];
                    // add a `srcset` attribute if renditions are availables
                    // NOTE: if renditions from renditionsService are not available For
                    // this picture, we should maybe use its own renditons
                    if (renditionsList && data.renditions) {
                        var renditionsHtml = [];
                        renditionsList.forEach(function(r) {
                            if (r.width) {
                                var rendition = data.renditions[r.name];
                                if (angular.isDefined(rendition)) {
                                    renditionsHtml.push(rendition.href.replace('http://', '//') + ' ' + rendition.width + 'w');
                                }
                            }
                        });
                        if (renditionsHtml.length > 0) {
                            html.push('srcset="' + renditionsHtml.join(', ') + '"');
                        }
                    }
                    html.push('/>');
                    return html.join(' ');
                });
            }
        };
        return $q.when(mediaTypes[data.type]());
    };

    this.getSelectedText = function() {
        var text = '';
        if (window.getSelection) {
            text = window.getSelection().toString();
        } else if (document.selection && document.selection.type !== 'Control') {
            text = document.selection.createRange().text;
        }
        return text;
    };
}

SdTextEditorBlockEmbedController.$inject = ['$timeout', 'editor', 'renditions', 'config'];
function SdTextEditorBlockEmbedController($timeout, editor, renditions, config) {
    var vm = this;
    angular.extend(vm, {
        embedCode: undefined,  // defined below
        caption: undefined,  // defined below
        editable: false,
        toggleEdition: function() {
            vm.editable = !vm.editable;
        },
        saveEmbedCode: function() {
            // update the block's model
            angular.extend(vm.model, {
                body: vm.embedCode
            });
            // on change callback
            vm.onBlockChange();
        },
        cancel: function() {
            vm.embedCode = vm.model.body;
        },
        saveCaption: function(caption) {
            // if block is a superdesk image (with association), we update the description_text
            if (vm.model.association) {
                vm.model.association.description_text = caption;
            }
            // update the caption in the model
            vm.model.caption = caption;
            // update the caption in the view
            vm.caption = caption;
            // on change callback
            $timeout(function() {
                vm.onBlockChange();
            });
        },
        isEditable: function(picture) {
            return picture._type !== 'externalsource';
        },
        editPicture: function(picture) {
            // only for SD images (with association)
            if (!vm.model.association) {
                return false;
            }
            vm.model.loading = true;
            renditions.crop(picture).then(function(picture) {
                // update block
                vm.model.association = picture;
                editor.generateMediaTag(picture).then(function(img) {
                    vm.model.body = img;
                });
                // update caption
                vm.saveCaption(vm.model.association.description_text);
            }).finally(function() {
                vm.model.loading = false;
            });
        }
    });
    $timeout(function() {
        angular.extend(vm, {
            embedCode: vm.model.body,
            caption: vm.model.caption
        });
    });
}

angular.module('superdesk.editor2', [
        'superdesk.editor2.ctrl',
        'superdesk.editor2.embed',
        'superdesk.editor2.content',
        'superdesk.editor.spellcheck',
        'superdesk.editor.utils',
        'superdesk.authoring',
        'angular-embed'
    ])
    .service('editor', EditorService)
    .constant('EMBED_PROVIDERS', { // see http://noembed.com/#supported-sites
        custom: 'Custom',
        twitter: 'Twitter',
        youtube: 'YouTube',
        vidible: 'Vidible'
    })
    .directive('sdAddEmbed', ['$timeout', function($timeout) {
        return {
            scope: {addToPosition: '=', extended: '=', onClose: '&'},
            require: ['sdAddEmbed', '^sdTextEditor'],
            templateUrl: 'scripts/superdesk/editor2/views/add-embed.html',
            controllerAs: 'vm',
            controller: 'SdAddEmbedController',
            bindToController: true,
            link: function(scope, element, attrs, controllers) {
                var vm = controllers[0];
                angular.extend(vm, {
                    editorCtrl: controllers[1]
                });
                // listen to the escape touch to close the field when pressed
                element.bind('keyup', function(e) {
                    if (e.keyCode === 27) { // escape
                        $timeout(function() {
                            vm.extended = false;
                        });
                    }
                });
            }
        };
    }])
    .directive('sdTextEditorDropZone', ['editor',
    function (editor) {
        var dragOverClass = 'medium-editor-dragover';
        return {
            require: '^sdTextEditorBlockText',
            scope: {sdTextEditorDropZone: '@'},
            link: function(scope, element, attrs, ctrl) {
                if (scope.sdTextEditorDropZone === 'false') {
                    return;
                }
                var MEDIA_TYPES = ['application/superdesk.item.picture', 'application/superdesk.item.video'];
                element.on('drop dragdrop', function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    var media_type = event.originalEvent.dataTransfer.types[0];
                    var item = angular.fromJson(event.originalEvent.dataTransfer.getData(media_type));
                    var paragraph = angular.element(event.target);
                    paragraph.removeClass(dragOverClass);
                    if (paragraph.text() === '') {
                        // select paragraph element in order to know position
                        ctrl.selectElement(paragraph.get(0));
                        ctrl.insertMedia(item);
                    }
                })
                .on('dragover', function(event) {
                    var paragraph = angular.element(event.target);
                    if (MEDIA_TYPES.indexOf(event.originalEvent.dataTransfer.types[0]) > -1) {
                        // allow to overwite the drop binder (see above)
                        event.preventDefault();
                        event.stopPropagation();
                        // if dragged element is a picture and if the paragraph is empty, highlight the paragraph
                        if (paragraph.text() === '') {
                            return paragraph.addClass(dragOverClass);
                        }
                    }
                    // otherwise, remove the style
                    paragraph.removeClass(dragOverClass);
                })
                .on('dragleave', function(event) {
                    var paragraph = angular.element(event.target);
                    paragraph.removeClass(dragOverClass);
                });
            }
        };
    }])
    .directive('sdTextEditor', ['$timeout', 'lodash', function ($timeout, _) {
        return {
            scope: {type: '=', config: '=', editorformat: '=', language: '=', associations: '=?'},
            require: ['sdTextEditor', 'ngModel'],
            templateUrl: 'scripts/superdesk/editor2/views/editor.html',
            controllerAs: 'vm',
            controller: 'SdTextEditorController',
            bindToController: true,
            link: function(scope, element, attr, controllers) {
                var controller = controllers[0];
                var ngModel = controllers[1];
                function init() {
                    scope.$applyAsync(function() {
                        if (controller.config.multiBlockEdition) {
                            controller.initEditorWithMultipleBlock(ngModel);
                        } else {
                            controller.initEditorWithOneBlock(ngModel);
                        }
                    });
                }
                // init editor based on model
                init();
                // when the model changes from outside, updates the editor
                scope.$watch(function outsideModelChange() {
                    return ngModel.$viewValue;
                }, function() {
                    $timeout(function() {
                        // if controller is ready and the value has changed
                        if (controller.blocks.length > 0 && ngModel.$viewValue !== controller.serializeBlock()) {
                            // if blocks are not loading
                            if (!_.some(controller.blocks, function(block) {
                                return block.loading;
                            })) {
                                init();
                            }
                        }
                    }, 250, false);
                });
            }
        };
    }])
    .directive('sdTextEditorBlockEmbed', ['$timeout', function ($timeout) {
        return {
            scope: {type: '=', config: '=', language: '=', model: '=sdTextEditorBlockEmbed', onBlockChange: '&'},
            templateUrl: 'scripts/superdesk/editor2/views/block-embed.html',
            controllerAs: 'vm',
            bindToController: true,
            controller: SdTextEditorBlockEmbedController
        };
    }])
    .directive('sdTextEditorBlockText', ['editor', 'spellcheck', '$timeout', 'superdesk', '$q', 'gettextCatalog', 'config', '$rootScope',
    function (editor, spellcheck, $timeout, superdesk, $q, gettextCatalog, config, $rootScope) {
        var TOP_OFFSET = 134; // header height

        var EDITOR_CONFIG = {
            toolbar: {
                static: true,
                align: 'left',
                sticky: true,
                stickyTopOffset: TOP_OFFSET,
                updateOnEmptySelection: true
            },
            paste: {
                forcePlainText: false,
                cleanPastedHTML: false
            },
            anchor: {
                placeholderText: gettext('Paste or type a full link'),
                linkValidation: true
            },
            anchorPreview: {
                showWhenToolbarIsVisible: true
            },
            placeholder: false,
            disableReturn: false,
            spellcheck: false,
            targetBlank: true
        };
        if (config.editor) {
            angular.extend(EDITOR_CONFIG, config.editor);
        }

        /**
         * Get number of lines for all p nodes before given node withing same parent.
         */
        function getLinesBeforeNode(p) {

            function getLineCount(text) {
                return text.split('\n').length;
            }

            var lines = 0;
            while (p) {
                if (p.childNodes.length && p.childNodes[0].nodeType === Node.TEXT_NODE) {
                    lines += getLineCount(p.childNodes[0].wholeText);
                } else if (p.childNodes.length) {
                    lines += 1; // empty paragraph
                }
                p = p.previousSibling;
            }

            return lines;
        }

        /**
         * Get line/column coordinates for given cursor position.
         */
        function getLineColumn() {
            var column, lines,
                selection = window.getSelection();
            if (selection.anchorNode.nodeType === Node.TEXT_NODE) {
                var text = selection.anchorNode.wholeText.substring(0, selection.anchorOffset);
                var node = selection.anchorNode;
                column = text.length + 1;
                while (node.nodeName !== 'P') {
                    if (node.previousSibling) {
                        column += node.previousSibling.wholeText ?
                            node.previousSibling.wholeText.length :
                            node.previousSibling.textContent.length;
                        node = node.previousSibling;
                    } else {
                        node = node.parentNode;
                    }
                }

                lines = 0 + getLinesBeforeNode(node);
            } else {
                lines = 0 + getLinesBeforeNode(selection.anchorNode);
                column = 1;
            }

            return {
                line: lines,
                column: column
            };
        }

        function extractBlockContentsFromCaret() {
            function getBlockContainer(node) {
                while (node) {
                    if (node.nodeType === 1 && /^(DIV)$/i.test(node.nodeName)) {
                        return node;
                    }
                    node = node.parentNode;
                }
            }
            var sel = window.getSelection();
            if (sel.rangeCount) {
                var selRange = sel.getRangeAt(0);
                var blockEl = getBlockContainer(selRange.endContainer);
                if (blockEl) {
                    var range = selRange.cloneRange();
                    range.selectNodeContents(blockEl);
                    range.setStart(selRange.endContainer, selRange.endOffset);
                    var remaining = range.extractContents();
                    var $blockEl = $(blockEl);
                    // clear if empty of text
                    if ($blockEl.text() === '') {
                        $blockEl.html('');
                    }
                    // remove empty last line
                    $blockEl.find('p:last').each(function() {
                        if ($(this).text() === '') {
                            this.remove();
                        }
                    });
                    return remaining;
                }
            }
        }

        function setEditorFormatOptions(editorConfig, editorFormat, scope) {
            _.each(editorFormat, function(format) {
                switch (format) {
                    case 'h1':
                        editorConfig.toolbar.buttons.push({
                            name: 'h1',
                            action: 'append-h2',
                            aria: gettextCatalog.getString('header type 1'),
                            tagNames: ['h2'],
                            contentDefault: '<b>' + gettextCatalog.getString('H1') + '</b>',
                            classList: ['custom-class-h1'],
                            attrs: {
                                'data-custom-attr': 'attr-value-h1'
                            }
                        });
                        break;
                    case 'h2':
                        editorConfig.toolbar.buttons.push({
                            name: 'h2',
                            action: 'append-h3',
                            aria: gettextCatalog.getString('header type 2'),
                            tagNames: ['h3'],
                            contentDefault: '<b>' + gettextCatalog.getString('H2') + '</b>',
                            classList: ['custom-class-h2'],
                            attrs: {
                                'data-custom-attr': 'attr-value-h2'
                            }
                        });
                        break;
                    case 'bold':
                        editorConfig.toolbar.buttons.push({
                            name: 'bold',
                            action: 'bold',
                            aria: gettextCatalog.getString('bold'),
                            tagNames: ['b'],
                            contentDefault: '<b>' + gettextCatalog.getString('B') + '</b>'
                        });
                        break;
                    case 'underline':
                        editorConfig.toolbar.buttons.push({
                            name: 'underline',
                            action: 'underline',
                            aria: gettextCatalog.getString('underline'),
                            tagNames: ['u']
                        });
                        break;
                    case 'italic':
                        editorConfig.toolbar.buttons.push({
                            name: 'italic',
                            action: 'italic',
                            aria: gettextCatalog.getString('italic'),
                            tagNames: ['i'],
                            contentDefault: '<b>' + gettextCatalog.getString('I') + '</b>'
                        });
                        break;
                    case 'anchor':
                        editorConfig.toolbar.buttons.push({
                            name: 'anchor',
                            action: 'createLink',
                            aria: gettextCatalog.getString('link')
                        });
                        break;
                    case 'quote':
                        editorConfig.toolbar.buttons.push({
                            name: 'quote',
                            action: 'append-blockquote',
                            aria: gettextCatalog.getString('quote')
                        });
                        break;
                    case 'removeFormat':
                        editorConfig.toolbar.buttons.push({
                            name: 'removeFormat',
                            action: 'removeFormat',
                            aria: gettextCatalog.getString('remove formatting')
                        });
                        break;
                    case 'table':
                        if (scope.config.multiBlockEdition) {
                            editorConfig.toolbar.buttons.push(format);
                        }
                        break;
                    default:
                        editorConfig.toolbar.buttons.push(format);
                }
            });
        }

        return {
            scope: {type: '=', config: '=', language: '=', sdTextEditorBlockText: '='},
            require: ['ngModel', '^sdTextEditor', 'sdTextEditorBlockText'],
            templateUrl: 'scripts/superdesk/editor2/views/block-text.html',
            link: function(scope, elem, attrs, controllers) {
                var ngModel = controllers[0];
                var sdTextEditor = controllers[1];
                scope.model = ngModel;
                // give the block model and the editor controller to the text block controller
                var vm = controllers[2];
                angular.extend(vm, {
                    block: scope.sdTextEditorBlockText,
                    sdEditorCtrl: sdTextEditor
                });
                vm.block = scope.sdTextEditorBlockText;
                var editorElem;
                var updateTimeout;
                var renderTimeout;
                ngModel.$viewChangeListeners.push(changeListener);
                ngModel.$render = function() {
                    editor.registerScope(scope);
                    var editorConfig = angular.merge({}, EDITOR_CONFIG, scope.config || {});

                    if (editorConfig.toolbar) {
                        editorConfig.toolbar.buttons = [];
                        setEditorFormatOptions(editorConfig, sdTextEditor.editorformat, scope);
                        // if config.multiBlockEdition is true, add Embed and Image button to the toolbar
                        if (scope.config.multiBlockEdition) {
                            // this dummy imageDragging stop preventing drag & drop events
                            editorConfig.extensions = {'imageDragging': {}};
                            if (editorConfig.toolbar.buttons.indexOf('table') !== -1 && angular.isDefined(MediumEditorTable)) {
                                editorConfig.extensions.table =
                                new MediumEditorTable({aria:gettextCatalog.getString('insert table')});
                            }
                        }
                    }

                    spellcheck.setLanguage(scope.language);
                    editorElem = elem.find(scope.type === 'preformatted' ?  '.editor-type-text' : '.editor-type-html');
                    // events could be attached already, so remove these
                    editorElem.off('mouseup keydown keyup click contextmenu');
                    editorElem.empty();
                    editorElem.html(ngModel.$viewValue || '');
                    scope.node = editorElem[0];
                    scope.model = ngModel;
                    // destroy exiting instance
                    if (scope.medium) {
                        scope.medium.destroy();
                    }

                    // create a new instance of the medium editor binded to this node
                    scope.medium = new MediumEditor(scope.node, editorConfig);
                    // restore the selection if exist
                    if (scope.sdTextEditorBlockText.caretPosition) {
                        scope.node.focus();
                        vm.restoreSelection();
                        // clear the saved position
                        scope.sdTextEditorBlockText.caretPosition = undefined;
                    }
                    // listen for paste event and insert a block if exists in clipboard
                    scope.medium.subscribe('editablePaste', function(e) {
                        var clipboard = vm.sdEditorCtrl.getCutBlock(true);
                        if (clipboard) {
                            e.preventDefault();
                            vm.sdEditorCtrl.splitAndInsert(vm, clipboard);
                        }
                    });
                    // listen caret moves in order to show or hide the (+) button beside the caret
                    function updateAddContentButton(e) {
                        scope.$emit('sdAddContent::updateState', e, editorElem);
                    }
                    editorElem.on('mouseup', updateAddContentButton);
                    ['editableInput', 'focus', 'blur', 'editableClick', 'editableKeyup'].forEach(function(eventName) {
                        scope.medium.subscribe(eventName, updateAddContentButton);
                    });
                    // listen updates by medium editor to update the model
                    scope.medium.subscribe('editableInput', function() {
                        cancelTimeout();
                        updateTimeout = $timeout(vm.updateModel, 800, false);
                    });
                    scope.medium.subscribe('blur', function() {
                        // save latest know caret position
                        vm.savePosition();

                        vm.updateModel();
                    });
                    // update the toolbar, bc it can be displayed at the
                    // wrong place if offset of block has changed
                    scope.medium.subscribe('focus', function() {
                        var toolbar = scope.medium.getExtensionByName('toolbar');
                        if (toolbar) {
                            toolbar.positionStaticToolbar(scope.medium.getFocusedElement());
                        }
                    });

                    // hide toolbar if element is under header
                    scope.medium.subscribe('positionedToolbar', function(e, elem) {
                        var toolbar = scope.medium.getExtensionByName('toolbar'),
                            elemPosition = elem.getBoundingClientRect();
                        if (toolbar) {
                            toolbar.toolbar.hidden = elemPosition.top < TOP_OFFSET;
                        }
                    });

                    function cancelTimeout(event) {
                        $timeout.cancel(updateTimeout);
                        startTyping();
                    }

                    function changeSelectedParagraph(direction) {
                        var selectedParagraph = angular.element(scope.medium.getSelectedParentElement());
                        var paragraphToBeSelected = selectedParagraph[direction > 0 ? 'next' : 'prev']('p');
                        if (paragraphToBeSelected.length > 0) {
                            // select the paragraph
                            scope.medium.selectElement(paragraphToBeSelected.get(0));
                            // scroll to the paragraph
                            var $scrollableParent = $('.page-content-container');
                            var offset = $scrollableParent.scrollTop();
                            offset += paragraphToBeSelected.position().top;
                            offset += paragraphToBeSelected.closest('.block__container').offset().top;
                            offset -= 100; //  margin to prevent the top bar to hide the selected paragraph
                            $scrollableParent.scrollTop(offset);
                        }
                    }

                    function toggleCase() {
                        var selectedText = editor.getSelectedText();
                        if (selectedText.length > 0) {
                            // looks the first character, and inverse the case of the all selection
                            if (selectedText[0].toUpperCase() === selectedText[0]) {
                                selectedText = selectedText.toLowerCase();
                            } else {
                                selectedText = selectedText.toUpperCase();
                            }
                            scope.medium.saveSelection();
                            // replace the selected text
                            scope.medium.cleanPaste(selectedText);
                            scope.medium.restoreSelection();
                        }
                    }

                    var ctrlOperations = {}, shiftOperations = {};
                    ctrlOperations[editor.KEY_CODES.UP] = changeSelectedParagraph.bind(null, -1);
                    ctrlOperations[editor.KEY_CODES.DOWN] = changeSelectedParagraph.bind(null, 1);
                    shiftOperations[editor.KEY_CODES.F3] = toggleCase;
                    editorElem.on('keydown', function(event) {
                        if (editor.shouldIgnore(event)) {
                            return;
                        }
                        // prevent default behaviour for ctrl or shift operations
                        if ((event.ctrlKey && ctrlOperations[event.keyCode]) ||
                            (event.shiftKey && shiftOperations[event.keyCode])) {
                            event.preventDefault();
                        }
                        cancelTimeout(event);
                    });
                    editorElem.on('keyup', function(event) {
                        if (editor.shouldIgnore(event)) {
                            return;
                        }
                        if (event.ctrlKey && ctrlOperations[event.keyCode]) {
                            ctrlOperations[event.keyCode]();
                            return;
                        }
                        if (event.shiftKey && shiftOperations[event.keyCode]) {
                            shiftOperations[event.keyCode]();
                            return;
                        }
                        cancelTimeout(event);
                        updateTimeout = $timeout(vm.updateModel, 800, false);
                    });

                    /**
                     * Test if given point {x, y} is in given bouding rectangle.
                     */
                    function isPointInRect(point, rect) {
                        return rect.left < point.x && rect.right > point.x && rect.top < point.y && rect.bottom > point.y;
                    }

                    editorElem.on('contextmenu', function(event) {
                        var err, pos;
                        var point = {x: event.clientX, y: event.clientY};
                        var errors = elem[0].parentNode.getElementsByClassName('sderror');
                        for (var i = 0, l = errors.length; i < l; i++) {
                            err = errors.item(i);
                            pos = err.getBoundingClientRect();
                            if (isPointInRect(point, pos)) {
                                event.preventDefault();
                                event.stopPropagation();
                                renderContextMenu(err);
                                return false;
                            }
                        }
                    });

                    function renderContextMenu(node) {
                        // close previous menu (if any)
                        scope.$apply(function() {
                            scope.suggestions = null;
                            scope.openDropdown = false;
                        });

                        // set data needed for replacing
                        scope.replaceWord = node.dataset.word;
                        scope.replaceIndex = parseInt(node.dataset.index, 10);
                        scope.sentenceWord = node.dataset.sentenceWord === 'true';

                        spellcheck.suggest(node.textContent).then(function(suggestions) {
                            if (scope.sentenceWord) {
                                suggestions.push({
                                    key: scope.replaceWord[0].toUpperCase() + scope.replaceWord.slice(1),
                                    value: scope.replaceWord[0].toUpperCase() + scope.replaceWord.slice(1)
                                });

                                scope.suggestions = suggestions.filter(suggestion => {
                                    return suggestion.key !== scope.replaceWord;
                                });
                            } else {
                                scope.suggestions = suggestions;
                            }
                            scope.replaceTarget = node;
                            scope.$applyAsync(function() {
                                var menu = elem[0].getElementsByClassName('dropdown-menu')[0];
                                menu.style.left = (node.offsetLeft) + 'px';
                                menu.style.top = (node.offsetTop + node.offsetHeight) + 'px';
                                menu.style.position = 'absolute';
                                scope.openDropdown = true;
                            });
                        });
                        return false;
                    }

                    if (scope.type === 'preformatted') {
                        editorElem.on('keydown keyup click', function() {
                            scope.$apply(function() {
                                angular.extend(scope.cursor, getLineColumn());
                            });
                        });
                    }

                    scope.$on('$destroy', function() {
                        scope.medium.destroy();
                        editorElem.off();
                    });
                    scope.cursor = {};
                    render(null, null, true);
                };

                scope.removeBlock = function() {
                    sdTextEditor.removeBlock(scope.sdTextEditorBlockText);
                };

                scope.$on('spellcheck:run', render);
                scope.$on('key:ctrl:shift:s', render);

                function render($event, event, preventStore) {
                    if (!$rootScope.config.features || !$rootScope.config.features.useTansaProofing) {
                        stopTyping();
                        editor.renderScope(scope, $event, preventStore);
                        if (event) {
                            event.preventDefault();
                        }
                    }
                }

                scope.replace = function(text) {
                    editor.replaceWord(scope, scope.replaceIndex, scope.replaceWord.length, text);
                    editor.commitScope(scope);
                };

                scope.addWordToDictionary = function() {
                    var word = scope.replaceTarget.textContent;
                    spellcheck.addWordToUserDictionary(word);
                    editor.render();
                };

                scope.ignoreWord = function() {
                    var word = scope.replaceTarget.textContent;
                    spellcheck.ignoreWord(word);
                    editor.render();
                };

                function changeListener() {
                    $timeout.cancel(renderTimeout);
                    renderTimeout = $timeout(render, 0, false);
                }

                function startTyping() {
                    scope.node.parentNode.classList.add(TYPING_CLASS);
                }

                function stopTyping() {
                    scope.node.parentNode.classList.remove(TYPING_CLASS);
                }
            },
            controller: ['$scope', 'editor', 'api', 'superdesk', 'renditions', 'config',
                         function(scope, editor, api , superdesk, renditions, config) {
                var vm = this;
                angular.extend(vm, {
                    block: undefined, // provided in link method
                    sdEditorCtrl: undefined, // provided in link method
                    selectElement: function(element) {
                        scope.medium.selectElement(element);
                        // save position
                        vm.savePosition();
                    },
                    restoreSelection: function() {
                        scope.medium.importSelection(vm.block.caretPosition);
                        // put the caret at end of the selection
                        scope.medium.options.ownerDocument.getSelection().collapseToEnd();
                    },
                    savePosition: function() {
                        vm.block.caretPosition = scope.medium.exportSelection();
                    },
                    extractEndOfBlock: function() {
                        // it can happen that user lost the focus on the block when this fct in called
                        // so we restore the latest known position
                        vm.restoreSelection();
                        // extract the text after the cursor
                        var remainingElementsContainer = document.createElement('div');
                        remainingElementsContainer.appendChild(extractBlockContentsFromCaret().cloneNode(true));
                        // remove the first line if empty
                        $(remainingElementsContainer).find('p:first').each(function() {
                            if ($(this).text() === '') {
                                this.remove();
                            }
                        });
                        return remainingElementsContainer;
                    },
                    updateModel: function() {
                        editor.commitScope(scope);
                    },
                    insertMedia: function(media) {
                        var mediaType = {
                            'picture': 'Image',
                            'video': 'Video'
                        };
                        var imageBlock = {
                            blockType: 'embed',
                            embedType: mediaType[media.type],
                            caption: media.description_text,
                            loading: true,
                            association: media
                        };
                        vm.sdEditorCtrl.splitAndInsert(vm, imageBlock).then(function(block) {
                            // load the media and update the block
                            $q.when((function() {
                                if (config.features && 'editFeaturedImage' in config.features &&
                                    !config.features.editFeaturedImage && media._type === 'externalsource') {
                                    return media;
                                } else {
                                    return renditions.ingest(media);
                                }
                            })()).then(function(media) {
                                editor.generateMediaTag(media).then(function(imgTag) {
                                    angular.extend(block, {
                                        body: imgTag,
                                        association: media,
                                        loading: false
                                    });
                                    $timeout(vm.sdEditorCtrl.commitChanges);
                                });
                            });
                        });
                    }
                });
            }]
        };
    }])
    .run(['embedService', 'iframelyService', function(embedService, iframelyService) {
        var playBuzzPattern = 'https?:\/\/(?:www)\.playbuzz\.com(.*)$';
        var playBuzzlLoader = '//snappa.embed.pressassociation.io/playbuzz.js';
        var playBuzzEmbed = [
            '<script type="text/javascript" src="$_LOADER"></script>',
            '<div class="pb_feed" data-game="$_URL" data-recommend="false" ',
            'data-game-info="false" data-comments="false" data-shares="false" ></div>'
        ].join('');
        embedService.registerHandler({
            name: 'PlayBuzz',
            patterns: [playBuzzPattern],
            embed: function(url) {
                return iframelyService.embed(url)
                .then(function(result) {
                    result.html = playBuzzEmbed
                        .replace('$_LOADER', playBuzzlLoader)
                        .replace('$_URL', url.match(playBuzzPattern)[1]);
                    return result;
                });
            }
        });
        var samdeskEmbed = [
            '<script>(function(d, s, id) { var fjs = d.getElementsByTagName(s)[0];',
            'var js = d.createElement(s); js.id = id; js.src = \'https://embed.samdesk.io/js/2/embed.js\';',
            'fjs.parentNode.insertBefore(js, fjs); }(document, \'script\', \'sam-embed-js\'));</script>',
            '<div class="sam-embed" data-href="embed.samdesk.io/embed/$_ID"></div>'
        ].join('');
        var samDeskPattern = 'https?://embed.samdesk.io/(?:embed|preview)/(.+)';
        embedService.registerHandler({
            name: 'SAMDesk',
            patterns: [samDeskPattern],
            embed: function(url) {
                var embed = samdeskEmbed.replace('$_ID', url.match(samDeskPattern)[1]);
                return {
                    provider_name: 'SAMDesk',
                    html: embed,
                    url: url,
                    type: 'rich'
                };
            }
        });

    }])
    .config(['embedServiceProvider', 'iframelyServiceProvider', '$injector',
        function(embedServiceProvider, iframelyServiceProvider, $injector) {
        var config = $injector.get('config');
        // iframe.ly private key
        iframelyServiceProvider.setKey(config.iframely.key);
        // don't use noembed as first choice
        embedServiceProvider.setConfig('useOnlyFallback', true);
        // iframely respect the original embed for more services than 'embedly'
        embedServiceProvider.setConfig('fallbackService', 'iframely');
    }]);

function EditorUtilsFactory() {

    var CLONE_CLASS = 'clone';
    var HILITE_CLASS = 'sdhilite';
    var ACTIVE_CLASS = 'sdactive';
    var FINDREPLACE_CLASS = 'sdfindreplace';

    /**
     * Function for sorting array of strings from longest to shortest
     *
     * @param {string} a
     * @param {string} b
     * @return {number}
     */
    function reverseLengthSort(a, b) {
        return b.length - a.length;
    }

    /**
     * Find text node within given node for given character offset
     *
     * This will find text node within given node that contains character on given offset
     *
     * @param {Node} node
     * @param {numeric} offset
     * @return {Object} {node: {Node}, offset: {numeric}}
     */
    function findOffsetNode(node, offset) {
        var tree = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        var currentLength;
        var currentOffset = 0;
        var ZERO_WIDTH_SPACE = String.fromCharCode(65279);
        while (tree.nextNode()) {
            tree.currentNode.textContent = tree.currentNode.textContent.replace(ZERO_WIDTH_SPACE, '');
            currentLength = tree.currentNode.textContent.length;
            if (currentOffset + currentLength >= offset) {
                return {node: tree.currentNode, offset: offset - currentOffset};
            }

            currentOffset += currentLength;
        }
    }

    return {

        /**
         * Find all matches for current find&replace needle in given node
         *
         * Each match is {word: {string}, offset: {number}} in given node,
         * we can't return nodes here because those will change when we start
         * highlighting and offsets wouldn't match
         *
         * @param {Node} node
         * @param {Object} settings
         * @return {Array} list of matches
         */
        getFindReplaceTokens: function(node, settings) {
            var tokens = [];
            var diff = settings.findreplace.diff || {};
            var pattern = Object.keys(diff).sort(reverseLengthSort).map(escapeRegExp).join('|');
            if (!pattern) {
                return tokens;
            }

            var flags = settings.findreplace.caseSensitive ? 'm' : 'im';
            var re = new RegExp(pattern, flags);
            var nodeOffset = 0;
            var text, match, offset;
            var isActive, elementClone, elementFindReplace;

            elementClone = node.parentNode.getElementsByClassName(CLONE_CLASS);

            if (elementClone && elementClone.length) {
                elementFindReplace = elementClone.item(0).getElementsByClassName(FINDREPLACE_CLASS);
            }

            function isTokenActive(index) {
                var active, matched;
                if (elementFindReplace && elementFindReplace.length) {
                    matched = _.filter(elementFindReplace, function(elem) {
                        return parseInt(elem.getAttribute('data-index'), 10) === index;
                    });

                    active = (matched && matched.length) ? matched[0].classList.contains(ACTIVE_CLASS) : false;
                }
                return active;
            }

            var tree = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            while (tree.nextNode()) {
                text = tree.currentNode.textContent;

                while ((match = text.match(re)) != null) {
                    isActive = isTokenActive(nodeOffset + match.index);

                    tokens.push({
                        word: match[0],
                        index: nodeOffset + match.index,
                        title: diff[match[0]] || '',
                        active: isActive
                    });

                    offset = match.index + match[0].length;
                    text = text.substr(offset);
                    nodeOffset += offset;
                }
                nodeOffset += text.length;
            }

            return tokens;
        },

        /**
         * Hilite all tokens within node using span with given className
         *
         * This first stores caret position, updates markup, and then restores the caret.
         *
         * @param {Node} node
         * @param {Array} tokens
         * @param {string} className
         * @param {Boolean} preventStore
         */
        hilite: function(node, tokens, className, preventStore) {
            // remove old hilites
            this.removeHilites(node);

            // create a clone
            var hiliteNode = node.cloneNode(true);
            hiliteNode.classList.add(CLONE_CLASS);

            // generate hilite markup in clone
            tokens.forEach(function(token) {
                this.hiliteToken(hiliteNode, token, className);
            }.bind(this));

            // render clone
            node.parentNode.appendChild(hiliteNode);
        },

        /**
         * Highlight single `token` via putting it into a span with given class
         *
         * @param {Node} node
         * @param {Object} token
         * @param {string} className
         */
        hiliteToken: function(node, token, className) {
            var start = this.findWordNode(node, token.index, token.word.length);
            var replace = start.node.splitText(start.offset);
            var span = document.createElement('span');

            span.classList.add(className);
            span.classList.add(HILITE_CLASS);

            if (token.active) {
                span.classList.add(ACTIVE_CLASS);
            }

            replace.splitText(token.word.length);
            span.textContent = replace.textContent;
            span.dataset.word = token.word;
            span.dataset.index = token.index;
            if (token.sentenceWord) {
                span.dataset.sentenceWord = 'true';
                span.classList.add('sdCapitalize');
            }
            replace.parentNode.replaceChild(span, replace);
        },

        /**
         * Remove hilites node from nodes parent
         *
         * @param {Node} node
         */
        removeHilites: function(node) {
            var parentNode = node.parentNode;
            var clones = parentNode.getElementsByClassName(CLONE_CLASS);
            if (clones.length) {
                parentNode.removeChild(clones.item(0));
            }
        },

        /**
         * Find text node within given node where word is located
         *
         * It will find text type node where the whole word is located
         *
         * @param {Node} node
         * @param {Number} index
         * @param {Number} length
         * @return {Object} {node: {Node}, offset: {Number}}
         */
        findWordNode: function(node, index, length) {
            var start = findOffsetNode(node, index);
            var end = findOffsetNode(node, index + length);

            // correction for linebreaks - first node on a new line is set to
            // linebreak text node which is not even visible in dom, maybe dom bug?
            if (start.node !== end.node) {
                start.node = end.node;
                start.offset = 0;
            }

            return start;
        }
    };
}

angular.module('superdesk.editor.utils', [])
    .factory('editorUtils', EditorUtilsFactory);
