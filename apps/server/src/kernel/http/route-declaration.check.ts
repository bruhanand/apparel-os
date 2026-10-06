import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { ROUTE_METADATA } from './api-route.js';

/**
 * Stops the application at start when a controller serves a method its route table does not declare, through
 * ApiRoute (code-house-rules 12.1 "Access on every route", 12.2). So no route runs without its declared access,
 * schemas and codes (PRD-SEC-005).
 */
@Injectable()
export class RouteDeclarationCheck implements OnApplicationBootstrap {
  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(MetadataScanner) private readonly scanner: MetadataScanner,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    const undeclared: string[] = [];
    for (const wrapper of this.discovery.getControllers()) {
      const instance = wrapper.instance as object | undefined;
      if (instance === undefined) continue;
      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const name of this.scanner.getAllMethodNames(prototype)) {
        const method = prototype[name];
        if (typeof method !== 'function') continue;
        const served = this.reflector.get<unknown>(PATH_METADATA, method) !== undefined;
        if (served && this.reflector.get<unknown>(ROUTE_METADATA, method) === undefined) {
          undeclared.push(`${String(wrapper.name)}.${name}`);
        }
      }
    }
    if (undeclared.length > 0) {
      throw new Error(
        `Routes not declared in the route table (serve them with @ApiRoute, code-house-rules 12.1): ${undeclared.join(', ')}`,
      );
    }
  }
}
