import { Constants } from '@auxo-dev/dkg';
export const PROJECT_MEMBER_MAX_SIZE = 2 ** 3;
export const ADDRESS_MAX_SIZE = 16;
export const INSTANCE_LIMITS = {
    PROJECT: 2 ** 5,
    CAMPAIGN: 2 ** 5,
    PARTICIPATION: Constants.REQUEST_MAX_SIZE,
};

export const MINIMAL_MINA_UNIT = 100000000n;

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
