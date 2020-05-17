import { ILogger } from "core/logging";
import { HttpClientRequestMethods, JsonClientResponse } from "core/clients";
import {
  PackageRequest,
  PackageSourceTypes,
  PackageVersionTypes,
  VersionHelpers,
  SuggestionFactory,
  PackageDocument
} from "core/packages";

import { JsonHttpClientRequest } from "infrastructure/clients";

import { NpmConfig } from "../config";
import { NpaSpec } from "../models/npaSpec";

export class GithubClient extends JsonHttpClientRequest {

  config: NpmConfig;

  constructor(
    config: NpmConfig,
    cacheDuration: number,
    logger: ILogger
  ) {
    super(
      logger,
      {
        accept: 'application\/vnd.github.v3+json',
        'user-agent': 'vscode-contrib/vscode-versionlens'
      },
      cacheDuration
    );

    this.config = config;
  }

  fetchGithub(
    request: PackageRequest<NpmConfig>,
    npaSpec: NpaSpec
  ): Promise<PackageDocument> {
    const { validRange } = require('semver');

    if (npaSpec.gitRange) {
      // we have a semver:x.x.x
      return this.fetchTags(request, npaSpec);
    }

    if (validRange(npaSpec.gitCommittish, VersionHelpers.loosePrereleases)) {
      // we have a #x.x.x
      npaSpec.gitRange = npaSpec.gitCommittish;
      return this.fetchTags(request, npaSpec);
    }

    // we have a #commit
    return this.fetchCommits(request, npaSpec);
  }

  fetchTags(request: PackageRequest<NpmConfig>, npaSpec: NpaSpec) {
    // todo pass in auth
    const { user, project } = npaSpec.hosted;
    const tagsRepoUrl = `https://api.github.com/repos/${user}/${project}/tags`;

    return this.requestJson(HttpClientRequestMethods.get, tagsRepoUrl, {})
      .then((response: JsonClientResponse) => {
        // extract versions
        const tags = <[]>response.data;

        const rawVersions = tags.map((tag: any) => tag.name);

        const allVersions = VersionHelpers.filterSemverVersions(rawVersions);

        const source: PackageSourceTypes = PackageSourceTypes.Github;

        const provider = request.clientData.providerName;

        const requested = request.package;

        const type: PackageVersionTypes = npaSpec.gitRange ?
          PackageVersionTypes.Range :
          PackageVersionTypes.Version;

        const versionRange = npaSpec.gitRange;

        const resolved = {
          name: project,
          version: versionRange,
        };

        // seperate versions to releases and prereleases
        const { releases, prereleases } = VersionHelpers.splitReleasesFromArray(
          allVersions
        );

        // analyse suggestions
        const suggestions = SuggestionFactory.createSuggestionTags(
          versionRange,
          releases,
          prereleases
        );

        return {
          provider,
          source,
          response,
          type,
          requested,
          resolved,
          suggestions,
          releases,
          prereleases,
        };

      });

  }

  fetchCommits(request: PackageRequest<NpmConfig>, npaSpec: NpaSpec) {
    // todo pass in auth
    const { user, project } = npaSpec.hosted;
    const commitsRepoUrl = `https://api.github.com/repos/${user}/${project}/commits`;

    return this.requestJson(HttpClientRequestMethods.get, commitsRepoUrl, {})
      .then((response: JsonClientResponse) => {

        const commitInfos = <[]>response.data

        const commits = commitInfos.map((commit: any) => commit.sha);

        const source: PackageSourceTypes = PackageSourceTypes.Github;

        const provider = request.clientData.providerName;

        const requested = request.package;

        const type = PackageVersionTypes.Committish;

        const versionRange = npaSpec.gitCommittish;

        // no commits found
        if (commits.length === 0) {
          return;
        }

        const commitIndex = commits.findIndex(commit => commit.indexOf(versionRange) > -1);

        const latestCommit = commits[commits.length - 1].substring(0, 8);

        const noMatch = commitIndex === -1;

        const isLatest = commitIndex === 0;

        const resolved = {
          name: project,
          version: versionRange,
        };

        const suggestions = [];

        if (noMatch) {
          suggestions.push(
            SuggestionFactory.createNoMatch(),
            SuggestionFactory.createLatest(latestCommit)
          );
        } else if (isLatest) {
          suggestions.push(
            SuggestionFactory.createMatchesLatest()
          );
        } else if (commitIndex > 0) {
          suggestions.push(
            SuggestionFactory.createFixedStatus(versionRange),
            SuggestionFactory.createLatest(latestCommit)
          );
        }

        return {
          provider,
          source,
          response,
          type,
          requested,
          resolved,
          suggestions,
          releases: [],
          prereleases: [],
        };

      });

  }

}