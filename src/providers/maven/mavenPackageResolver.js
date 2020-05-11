import appSettings from '../../appSettings';
import * as ErrorFactory from 'core/errors/factory';
import * as PackageLensFactory from 'presentation/lenses/factories/packageLensFactory';
import { mavenGetPackageVersions } from './mavenAPI';
import { buildMapFromVersionList, buildTagsFromVersionMap } from './versionUtils'

export function resolveMavenPackage(name, requestedVersion, appContrib) {

  // get all the versions for the package
  return mavenGetPackageVersions(name)
    .then((versions) => {
      // console.log(versions);

      let versionMeta = buildMapFromVersionList(versions, requestedVersion)

      let extractedTags = buildTagsFromVersionMap(versionMeta, requestedVersion)

      let filteredTags = extractedTags;
      if (appSettings.showTaggedVersions === false) {
        filteredTags = extractedTags.filter(tag => {
          if (tag.name && /alpha|beta|rc|milestone|snapshot|sp/.test(tag.name)) {
            return false
          }
          return true
        })
      }

      if (versionMeta.allVersions.length === 0) {
        return PackageLensFactory.createPackageNotFound(
          name,
          requestedVersion,
          'maven'
        );
      }
      return filteredTags
        .map((tag, index) => {
          // generate the package data for each tag
          const meta = {
            type: 'maven',
            tag
          };

          return PackageLensFactory.createPackage(
            name,
            requestedVersion,
            meta,
            null
          );
        });

    })
    .catch(error => {
      // show the 404 to the user; otherwise throw the error
      if (error.status === 404) {
        return PackageLensFactory.createPackageNotFound(
          name,
          requestedVersion,
          'maven'
        );
      }

      ErrorFactory.createConsoleError("Maven", "mavenGetPackageVersions", name, error);
      return PackageLensFactory.createUnexpectedError(name, error);
    });

}
