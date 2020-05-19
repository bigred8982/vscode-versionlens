import { ILogger } from 'core/logging';
import {
  ResponseFactory,
  PackageRequest,
  PackageDocument,
  IPackageClient,
  DocumentFactory,
  PackageVersionTypes,
  PackageSourceTypes
} from 'core/packages';
import { ClientResponseSource } from "core/clients";

import { NpmConfig } from '../npmConfig';
import * as PackageFactory from '../factories/packageFactory';
import { NpaSpec, NpaTypes } from '../models/npaSpec';
import { PacoteClient } from './pacoteClient';
import { GithubClient } from './githubClient';
import * as NpmUtils from '../npmUtils';

export class NpmPackageClient implements IPackageClient<null> {

  logger: ILogger;

  config: NpmConfig;

  pacoteClient: PacoteClient;

  githubClient: GithubClient;

  constructor(config: NpmConfig, logger: ILogger) {
    this.config = config;
    this.logger = logger;
    this.pacoteClient = new PacoteClient(config, logger);
    this.githubClient = new GithubClient(config, logger);
  }

  async fetchPackage(request: PackageRequest<null>): Promise<PackageDocument> {
    const npa = require('npm-package-arg');

    return new Promise<PackageDocument>((resolve, reject) => {
      let npaSpec: NpaSpec;

      // try parse the package
      try {
        npaSpec = npa.resolve(
          request.package.name,
          request.package.version,
          request.package.path
        );
      }
      catch (error) {
        return reject(NpmUtils.convertNpmErrorToResponse(error, ClientResponseSource.local));
      }

      // return if directory or file document
      if (npaSpec.type === NpaTypes.Directory || npaSpec.type === NpaTypes.File) {
        return resolve(
          PackageFactory.createDirectory(
            request.providerName,
            request.package,
            ResponseFactory.createResponseStatus(ClientResponseSource.local, 200),
            npaSpec,
          )
        );
      }

      if (npaSpec.type === NpaTypes.Git) {

        if (!npaSpec.gitCommittish && !npaSpec.hosted) {
          // could not resolve
          return resolve(
            DocumentFactory.createInvalidVersion(
              request.providerName,
              request.package,
              ResponseFactory.createResponseStatus(ClientResponseSource.local, 0),
              PackageVersionTypes.Committish
            )
          );
        }

        // only support shortcuts
        if (!npaSpec.gitCommittish && npaSpec.hosted.default !== 'shortcut') {
          return resolve(
            DocumentFactory.createFixed(
              request.providerName,
              PackageSourceTypes.Git,
              request.package,
              ResponseFactory.createResponseStatus(ClientResponseSource.local, 0),
              PackageVersionTypes.Committish,
              'git repository'
            )
          );
        }

        // resolve tags, committishes
        return resolve(this.githubClient.fetchGithub(request, npaSpec));
      }

      // otherwise return registry result
      return resolve(this.pacoteClient.fetchPackage(request, npaSpec));

    }).catch(response => {
      if (!response.data) {
        response = NpmUtils.convertNpmErrorToResponse(
          response,
          ClientResponseSource.remote
        );
      }

      if (response.status === 404 || response.status === 'E404') {
        return DocumentFactory.createNotFound(
          request.providerName,
          request.package,
          null,
          ResponseFactory.createResponseStatus(response.source, 404)
        );
      }

      if (response.status === 'EINVALIDTAGNAME' || response.data.includes('Invalid comparator:')) {
        return DocumentFactory.createInvalidVersion(
          request.providerName,
          request.package,
          ResponseFactory.createResponseStatus(response.source, 404),
          null
        );
      }

      if (response.status === 'EUNSUPPORTEDPROTOCOL') {
        return DocumentFactory.createNotSupported(
          request.providerName,
          request.package,
          ResponseFactory.createResponseStatus(response.source, 404),
          null
        );
      }

      if (response.status === 128) {
        return DocumentFactory.createGitFailed(
          request.providerName,
          request.package,
          ResponseFactory.createResponseStatus(response.source, 404),
          null
        );
      }

      return Promise.reject(response);
    });

  }

}