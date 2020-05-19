import { ILogger } from 'core/logging';
import { UrlHelpers } from 'core/clients';
import { ProcessClientRequest } from 'infrastructure/clients';
import { MavenConfig } from '../mavenConfig';
import { MavenRepository } from '../definitions';

export class MvnClient extends ProcessClientRequest {

  config: MavenConfig;

  constructor(config: MavenConfig, logger: ILogger) {
    super(config.caching)
    this.config = config;
  }

  async fetchRepositories(cwd: string): Promise<Array<MavenRepository>> {
    const promisedCli = super.request(
      'mvn ',
      ['help:effective-settings'],
      cwd
    );

    return promisedCli.then(result => {
      const { data } = result;
      // check we have some data
      if (data.length === 0) return [];

      return parseLocalRepos(data);
    }).catch(error => {
      return [];
    }).then((repos: Array<string>) => {

      if (repos.length === 0) {
        // this.config.getDefaultRepository()
        repos.push("https://repo.maven.apache.org/maven2/")
      }

      return repos;

    }).then((repos: Array<string>) => {

      // parse urls to Array<MavenRepository.
      return repos.map(url => {
        const protocol = UrlHelpers.getProtocolFromUrl(url);
        return {
          url,
          protocol,
        }
      });

    });

  }

}

function parseLocalRepos(stdout: string): Array<string> {
  const xmldoc = require('xmldoc');
  const regex = /<\?xml(.+\r?\n?)+\/settings>/gm;
  const xmlString = regex.exec(stdout.toString())[0];
  const xml = new xmldoc.XmlDocument(xmlString);

  const localRepository = xml.descendantWithPath("localRepository");

  const results = [
    localRepository.val
  ];

  let repositoriesXml = xml.descendantWithPath("profiles.profile.repositories")
    .childrenNamed("repository");

  repositoriesXml.forEach(repositoryXml => {
    results.push(repositoryXml.childNamed("url").val)
  })

  return results;
}