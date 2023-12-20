export const PROJECT_MEMBER_MAX_SIZE = 2 ** 2;
export const CAMPAIGN_PARTICIPANT_MAX_SIZE = 2 ** 2;
export const ADDRESS_MAX_SIZE = 8;
export const INSTANCE_LIMITS = {
  PROJECT: 2 ** 2,
  CAMPAIGN: 2 ** 2,
  PARTICIPATION: 2 ** 2,
};

export enum ZkAppEnum {
  PROJECT,
  CAMPAIGN,
  PARTICIPATION,
}

export enum Contract {
  PROJECT = 'project',
  CAMPAIGN = 'campaign',
  PARTICIPATION = 'participation',
}
