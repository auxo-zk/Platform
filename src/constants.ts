import { Constants } from '@auxo-dev/dkg';
export const PROJECT_MEMBER_MAX_SIZE = 2 ** 4;
export const ADDRESS_MAX_SIZE = 8;
export const INSTANCE_LIMITS = {
  PROJECT: 2 ** 2,
  CAMPAIGN: 2 ** 2,
  PARTICIPATION: Constants.REQUEST_MAX_SIZE,
};

export enum ZkAppEnum {
  COMMITTEE,
  DKG,
  ROUND1,
  ROUND2,
  RESPONSE,
  REQUEST,
  PROJECT,
  CAMPAIGN,
  PARTICIPATION,
  FUNDING,
  TREASURY,
}

export enum Contract {
  COMMITTEE = 'committee',
  DKG = 'dkg',
  ROUND1 = 'round1',
  ROUND2 = 'round2',
  RESPONSE = 'response',
  REQUEST = 'request',
  PROJECT = 'project',
  CAMPAIGN = 'campaign',
  PARTICIPATION = 'participation',
  FUNDING = 'funding',
  TREASURY = 'treasury',
}
