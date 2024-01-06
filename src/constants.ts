import { Constants } from '@auxo-dev/dkg';
export const PROJECT_MEMBER_MAX_SIZE = 2 ** 3;
export const ADDRESS_MAX_SIZE = 16;
export const INSTANCE_LIMITS = {
  PROJECT: 2 ** 5,
  CAMPAIGN: 2 ** 5,
  PARTICIPATION: Constants.REQUEST_MAX_SIZE,
};
export enum Contract {
  // COMMITTEE = 'committee',
  // DKG = 'dkg',
  // ROUND1 = 'round1',
  // ROUND2 = 'round2',
  // RESPONSE = 'response',
  REQUEST = 'request',
  PROJECT = 'project',
  CAMPAIGN = 'campaign',
  PARTICIPATION = 'participation',
  FUNDING = 'funding',
  TREASURY = 'treasury',
}

function createEnumIndexMap(enumObj: any): { [key: string]: number } {
  const map: { [key: string]: number } = {};
  let index = 0;
  for (const key in enumObj) {
    if (enumObj.hasOwnProperty(key)) {
      map[enumObj[key].toUpperCase()] = index++;
    }
  }
  // console.log(map);
  return map;
}

export const ZkAppEnum = createEnumIndexMap(Contract);
