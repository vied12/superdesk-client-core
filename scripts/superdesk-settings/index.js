// styles
import './styles/settings.less';

import * as directive from './directives';

export default angular.module('superdesk.settings', [])
    .config(['superdeskProvider', function(superdesk) {
        superdesk.activity('/settings', {
            label: gettext('Settings'),
            description: gettext('Do some admin chores'),
            controller: angular.noop,
            templateUrl: 'scripts/superdesk-settings/views/main.html',
            category: superdesk.MENU_MAIN,
            priority: 1000,
            adminTools: true,
            _settings: 1
        });
    }])

    .directive('sdSettingsView', directive.SettingsView)
    .directive('sdDateParam', directive.DateParam)
    .directive('sdValidError', directive.ValidError)
    .directive('sdRoleUnique', directive.RoleUnique);
