export const PROJECT_MEMBER_MAX_SIZE = 2 ** 2;
export const ADDRESS_MAX_SIZE = 8;
export const INSTANCE_LIMITS = {
  PROJECT: 2 ** 2,
  CAMPAIGN: 2 ** 2,
};

export enum ZkAppEnum {
  PROJECT,
  CAMPAIGN,
}

export enum Contract {
  PROJECT = 'project',
  CAMPAIGN = 'campaign',
}
