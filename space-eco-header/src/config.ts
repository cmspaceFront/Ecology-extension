import { ImmutableObject } from 'seamless-immutable';
import { IMLinkParam } from 'jimu-core';

export interface Config {
  linkParam?: IMLinkParam;
}

export type IMConfig = ImmutableObject<Config>;