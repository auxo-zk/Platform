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

export { FundingAction, FundingContract };

class FundingAction extends Struct({
    fundingId: Field,
    investor: PublicKey,
    actionType: Field,
    amount: UInt64,
}) {}

class FundingInformation extends Struct({
    campaignId: Field,
    investor: PublicKey,
}) {}

class FundingContract extends SmartContract {
    @state(Field) nextFundingId = State<Field>();
    @state(Field) fundingInformationRoot = State<Field>();
    @state(Field) fundingAmountRoot = State<Field>();
    @state(Field) zkAppRoot = State<Field>();
    @state(Field) actionState = State<Field>();

    reducer = Reducer({ actionType: FundingAction });

    init(): void {
        super.init();
        this.nextFundingId.set(Field(0));
        this.fundingAmountRoot.set(DefaultRootForCampaignTree);
        this.zkAppRoot.set(DefaultRootForZkAppTree);
        this.actionState.set(Reducer.initialActionState);
    }

    @method fund(
        campaignId: Field,
        timeline: Timeline,
        timelineWitness: TimelineLevel1Witness,
        dkgContractRef: ZkAppRef,
        campaignContractRef: ZkAppRef,
        participationContractRef: ZkAppRef,
        treasuryContractRef: ZkAppRef,
        projectId: Field,
        projectIndex: Field,
        projectIndexWitness: ProjectIndexLevel1Witness,
        projectCounter: Field,
        projectCounterWitness: ProjectCounterLevel1Witness,
        committeeId: Field,
        keyId: Field,
        keyWitnessForCampaign: KeyLevel1Witness,
        key: PublicKey,
        keyWitnessForDkg: Storage.DKGStorage.Level1Witness,
        amount: UInt64,
        secretVector: ScalarVector,
        randomVector: ScalarVector,
        commitmentHash: Field,
        nullifier: Field
    ) {
        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        // Check Treasury contract
        verifyZkApp(
            FundingContract.name,
            treasuryContractRef,
            zkAppRoot,
            Field(ZkAppEnum.TREASURY)
        );
        // Check Dkg contract
        verifyZkApp(
            FundingContract.name,
            dkgContractRef,
            zkAppRoot,
            Field(ZkAppEnum.DKG)
        );
        const dkgContract = new DkgContract(dkgContractRef.address);
        // Should check valid of key right here
        dkgContract.verifyKey(
            Storage.DKGStorage.calculateKeyIndex(committeeId, keyId),
            key.toGroup(),
            keyWitnessForDkg
        );
        // Check Campaign contract
        verifyZkApp(
            FundingContract.name,
            campaignContractRef,
            zkAppRoot,
            Field(ZkAppEnum.CAMPAIGN)
        );
        const campaignContract = new CampaignContract(
            campaignContractRef.address
        );
        campaignContract
            .getCampaignTimelineState(campaignId, timeline, timelineWitness)
            .assertEquals(Field(CampaignTimelineStateEnum.FUNDING));
        campaignContract
            .isValidKey(campaignId, committeeId, keyId, keyWitnessForCampaign)
            .assertTrue();
        // Check Participation contract
        verifyZkApp(
            FundingContract.name,
            participationContractRef,
            zkAppRoot,
            Field(ZkAppEnum.PARTICIPATION)
        );
        const participationContract = new ParticipationContract(
            participationContractRef.address
        );
        participationContract
            .hasValidActionStateForFunding(timeline)
            .assertTrue();
        participationContract.isValidProjectIndex(
            campaignId,
            projectId,
            projectIndex,
            projectIndexWitness
        );
        participationContract.isValidProjectCounter(
            campaignId,
            projectCounter,
            projectCounterWitness
        );

        amount.mod(new UInt64(MINIMAL_MINA_UNIT)).assertEquals(new UInt64(0));

        // goi submit ben requester
        const investor = AccountUpdate.createSigned(this.sender);
        investor.send({
            to: AccountUpdate.create(treasuryContractRef.address),
            amount: amount,
        });

        this.reducer.dispatch(
            new FundingAction({
                fundingId: Field(-1),
                actionType: Field(FundingActionEnum.FUND),
                investor: this.sender,
                amount: amount,
            })
        );
    }

    @method refund(fundingId: Field, amount: UInt64) {
        // Prove that they fund to this contract
        // Call to treasury manager to send user refund

        this.reducer.dispatch(
            new FundingAction({
                fundingId: fundingId,
                actionType: Field(FundingActionEnum.REFUND),
                investor: this.sender,
                amount: amount,
            })
        );
    }

    isFunded() {
        //
    }
}
