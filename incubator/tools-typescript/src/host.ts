import { type Project, Service } from "@rnx-kit/typescript-service";
import ts from "typescript";
import {
  createResolverForTypescript,
  getTsTypeRefCache,
  resolveModuleNames,
} from "./resolver";
import type { PlatformInfo, ProjectContext } from "./types";

const platformHosts: Record<string, PlatformHost> = {};

/**
 * Get the platform host for a given platform, will be cached for that platform
 * @returns platform specific host implementation
 */
export function getPlatformHost(platformInfo?: PlatformInfo): PlatformHost {
  const platformName = platformInfo?.name ?? "none";
  const remap = platformInfo?.remapReactNative;
  const key = platformName + remap ? "-remap" : "";
  platformHosts[key] ??= new PlatformHost(platformInfo);
  return platformHosts[key];
}

/**
 * Open a typescript project for the given context. Can handle react-native specific
 * projects and will share cache information where possible given the configuration
 *
 * @param context information that drives the configuration of this typescript project
 * @returns an initialized typescript project
 */
export function openProject(context: ProjectContext): Project {
  return getPlatformHost(context.platform).createProject(context);
}

export class PlatformHost {
  private suffixes?: string[];
  private remap: Record<string, string> = {};
  private service = new Service();
  private newResolvers = ts.versionMajorMinor >= "5.0";

  constructor(platform: PlatformInfo = { name: "" } as PlatformInfo) {
    this.suffixes = platform.suffixes;
    const { remapReactNative, pkgName } = platform;

    if (remapReactNative && pkgName && pkgName !== "react-native") {
      this.remap["react-native"] = pkgName;
    }
  }

  createProject(context: ProjectContext): Project {
    // create the host enhancer and open the project
    const enhancer = this.createHostEnhancer(context);
    return this.service.openProject(context.cmdLine, enhancer);
  }

  private createHostEnhancer(context: ProjectContext) {
    const { reporter, cmdLine, writer, root } = context;
    const options = cmdLine.options;

    return (host: ts.LanguageServiceHost) => {
      // override writeFile if an alternate writer is specified
      if (writer) {
        host.writeFile = (file, content) => writer.writeFile(file, content);
      }

      // set up the resolution context with a resolver routed to typescript's internal resolve
      const resolutionContext = {
        resolver: createResolverForTypescript(root, options, host),
        suffixes: this.suffixes,
        remap: this.remap,
      };
      const typeRefCache = getTsTypeRefCache(root);

      // for lower versions of typescript hook the resolveModuleNames and resolveTypeReferenceDirectives functions
      if (!this.newResolvers) {
        // create an override for the module resolution function
        host.resolveModuleNames = (
          moduleNames: string[],
          containingFile: string,
          _reusedNames: string[] | undefined,
          redirected: ts.ResolvedProjectReference | undefined
        ): (ts.ResolvedModuleFull | undefined)[] => {
          return reporter.time("module resolution", () => {
            return resolveModuleNames(
              resolutionContext,
              moduleNames,
              containingFile,
              redirected
            );
          });
        };

        // create an override for the type reference resolution function
        host.resolveTypeReferenceDirectives = (
          typeDirectiveNames: string[] | ts.FileReference[],
          containingFile: string,
          redirected: ts.ResolvedProjectReference | undefined
        ): (ts.ResolvedTypeReferenceDirective | undefined)[] => {
          return reporter.time("resolve type directives", () => {
            return typeDirectiveNames.map((name) => {
              return ts.resolveTypeReferenceDirective(
                name as string,
                containingFile,
                options,
                host,
                redirected,
                typeRefCache
              ).resolvedTypeReferenceDirective;
            });
          });
        };
      } else {
        // for newer versions of typescript we need to use the new resolver API
        host.resolveModuleNameLiterals = (
          moduleLiterals,
          containingFile,
          redirected
        ) => {
          return reporter.time("module resolution", () => {
            return resolveModuleNames(
              resolutionContext,
              moduleLiterals.map((l) => l.text),
              containingFile,
              redirected
            ).map((r) => {
              return { resolvedModule: r };
            });
          });
        };

        host.resolveTypeReferenceDirectiveReferences = (
          typeDirectiveNames,
          containingFile,
          redirected
        ) => {
          return reporter.time("resolve type directives", () => {
            return typeDirectiveNames.map((name) => {
              const typeRef = typeof name === "string" ? name : name.fileName;
              return ts.resolveTypeReferenceDirective(
                typeRef,
                containingFile,
                options,
                host,
                redirected,
                typeRefCache
              );
            });
          });
        };
      }
    };
  }
}
