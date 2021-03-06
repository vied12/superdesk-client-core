ArchivedItemKill.$inject = ['authoring', 'api', 'notify', 'gettext'];

export function ArchivedItemKill(authoring, api, notify, gettext) {
    return {
        templateUrl: 'scripts/superdesk-archive/views/archived-kill.html',
        scope: {
            'item': '='
        },
        link: function (scope, elem, attr) {
            scope._editable = true;

            var itemToDelete = {'_id': scope.item._id, '_etag': scope.item._etag};
            api.remove(itemToDelete, {}, 'archived').then(
                function(response) {
                    var fields = _.union(_.keys(authoring.getContentFieldDefaults()), ['_id', 'versioncreated']);
                    var itemForTemplate = {template_name: 'kill', item: _.pick(scope.item, fields)};

                    api.save('content_templates_apply', {}, itemForTemplate, {}).then(function(result) {
                        itemForTemplate = _.pick(result, _.keys(authoring.getContentFieldDefaults()));
                        scope.item = _.create(scope.item);
                        _.each(itemForTemplate, function(value, key) {
                            if (!_.isUndefined(value) && !_.isEmpty(value)) {
                                scope.item[key] = value;
                            }
                        });
                    }, function(err) {
                        notify.error(gettext('Failed to apply kill template to the item.'));
                    });
                }, function (response) {
                    if (response.data._message) {
                        notify.error(response.data._message);
                    } else {
                        notify.error(gettext('Unknown Error: Cannot kill the item'));
                    }
                }
            );

            scope.kill = function () {
                api.save('archived', scope.item, _.pick(scope.item, ['headline', 'abstract', 'body_html']))
                    .then(function (response) {
                        notify.success(gettext('Item has been killed.'));
                        scope.cancel();
                    });
            };

            scope.cancel = function() {
                scope.item = null;
            };

        }
    };
}
