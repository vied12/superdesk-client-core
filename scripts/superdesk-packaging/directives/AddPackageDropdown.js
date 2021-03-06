AddPackageDropdown.$inject = ['$rootScope', 'api', 'packages', 'authoringWorkspace'];
export function AddPackageDropdown($rootScope, api, packages, authoringWorkspace) {
    return {
        templateUrl: 'scripts/superdesk-packaging/views/sd-add-package-dropdown.html',
        link: function(scope) {
            var pkg = authoringWorkspace.getItem();
            scope.groupList = null;
            if (pkg.highlight) {
                api('highlights').getById(pkg.highlight)
                .then(function(result) {
                    scope.groupList = result.groups;
                });
            }
            scope.groupList = scope.groupList || packages.groupList;

            scope.select = function(group) {
                packages.addPackageGroupItem(group, scope.item);
            };
        }
    };
}
