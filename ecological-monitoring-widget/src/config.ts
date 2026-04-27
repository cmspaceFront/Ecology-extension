import { ImmutableObject } from 'seamless-immutable';
import { type ImageResourceItemInfo } from 'jimu-for-builder';
import { type IMLinkParam } from 'jimu-ui/advanced/setting-components';

export interface MonitoringCard {
  id: string;
  title: string;
  titleUz?: string;
  titleUzCyrl?: string;
  titleRu?: string;
  description: string;
  descriptionUz?: string;
  descriptionUzCyrl?: string;
  descriptionRu?: string;
  imageUrl?: string;
}

export interface Config {
  logoUrl?: string;
  logoImageParam?: ImageResourceItemInfo;
  linkParam?: IMLinkParam;
  cardLinkParams?: Record<string, IMLinkParam>;
  earthScale?: number;
  earthRotationSpeed?: number;
  earthPositionY?: number;
  carouselTransitionDuration?: number;
  carouselAutoRotateInterval?: number;
}

export type IMConfig = ImmutableObject<Config>;

