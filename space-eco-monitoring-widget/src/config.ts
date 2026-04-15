import { ImmutableObject } from 'seamless-immutable';
import { type ImageResourceItemInfo } from 'jimu-for-builder';
import type { IMLinkParam } from 'jimu-core';


export interface Config {
  logoUrl?: string;
  logoImageParam?: ImageResourceItemInfo;
  linkParam?: IMLinkParam;
  earthScale?: number;
  earthRotationSpeed?: number;
  atmosphereRotationSpeed?: number;
  earthPositionY?: number;
}

export type IMConfig = ImmutableObject<Config>;


