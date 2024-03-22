import {
    Field,
    SmartContract,
    state,
    State,
    method,
    PublicKey,
    Group,
    Reducer,
    MerkleMapWitness,
    Struct,
    SelfProof,
    Poseidon,
    Provable,
    Void,
    Scalar,
    ZkProgram,
    Bool,
    UInt64,
    AccountUpdate,
} from 'o1js';

import { CustomScalar, ScalarDynamicArray, Utils } from '@auxo-dev/auxo-libs';

import {
    ZkApp as DkgZkApp,
    Constants as DkgConstants,
    DkgContract,
    Storage,
} from '@auxo-dev/dkg';

import { INSTANCE_LIMITS, MINIMAL_MINA_UNIT, ZkAppEnum } from '../Constants.js';

import {
    ZkAppRef,
    DefaultRootForZkAppTree,
    verifyZkApp,
} from '../storages/SharedStorage.js';

import {
    ScalarVector,
    GroupVector,
    getCommitmentHash,
    DefaultRootForCommitmentHashTree,
    Level1CHWitness,
    Level1Witness,
    TotalRStorage,
    TotalMStorage,
    TotalAmountStorage,
    FundingActionEnum,
} from '../storages/FundingStorage.js';
import {
    CampaignTimelineStateEnum,
    Timeline,
    Level1Witness as TimelineLevel1Witness,
    Level1Witness as KeyLevel1Witness,
    DefaultRootForCampaignTree,
} from '../storages/CampaignStorage.js';
import {
    Level1CWitness as ProjectIndexLevel1Witness,
    Level1Witness as ProjectCounterLevel1Witness,
} from '../storages/ParticipationStorage.js';
import { CampaignContract } from './Campaign.js';
import { ParticipationContract } from './Participation.js';

export { VestingContract };

class VestingAction extends Struct({}) {}

class VestingContract extends SmartContract {
    @state(Field) vestingInformationRoot = State<Field>();
    @state(Field) zkAppRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: VestingAction });

    init(): void {
        super.init();
        this.vestingInformationRoot.set(DefaultRootForCampaignTree);
        this.zkAppRoot.set(DefaultRootForZkAppTree);
        this.actionState.set(Reducer.initialActionState);
    }

    @method vote() {
        this.reducer.dispatch(new VestingAction({}));
    }

    @method claimMileStoneFund() {}
}
