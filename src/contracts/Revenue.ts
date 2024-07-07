import {
    Field,
    SmartContract,
    state,
    State,
    method,
    PublicKey,
    Poseidon,
    Provable,
    Bool,
    UInt64,
    AccountUpdate,
    UInt8,
    UInt32,
    Permissions,
    provable,
    Struct,
    ZkProgram,
    SelfProof,
    Void,
    Reducer,
} from 'o1js';

import {
    ZkApp as DkgZkApp,
    Constants as DkgConstants,
    Storage as DkgStorage,
    RequesterContract,
    RequesterLevel1Witness,
    Libs as DkgLibs,
    KeyStatusInput,
    KeyStatus,
} from '@auxo-dev/dkg';

import { CustomScalar, Utils } from '@auxo-dev/auxo-libs';

import {
    MINIMAL_MINA_UNIT,
    ZkAppIndex,
    THRESHOLD,
    ErrorEnum,
} from '../Constants.js';

import {
    ZkAppRef,
    DefaultRootForZkAppTree,
    verifyZkApp,
    AddressWitness,
} from '../storages/SharedStorage.js';

import {
    CampaignLevel1Witness,
    DefaultRootForCampaignTree,
} from '../storages/CampaignStorage.js';

import {
    RevenueInfo as RevenueAction,
    RevenueInfoStorage,
    DefaultRootForRevenueTree,
    RevenueLevel1Witness,
    RevenueInfo,
} from '../storages/RevenueStorage.js';

import { TreasuryAddressLevel1Witness } from '../storages/ProjectStorage.js';

import { ClaimedAmountLevel1Witness } from '../storages/TreasuryManagerStorage.js';

import { ProjectContract } from './Project.js';
import { NullifierContract } from './Nullifier.js';
import { ParticipationContract } from './Participation.js';

import { ProjectIndexLevel1Witness } from '../storages/ParticipationStorage.js';
import { NullifierLevel1Witness } from '../storages/NullifierStorage.js';
import { TreasuryManagerContract } from './TreasuryManager.js';

export {
    RevenueContract,
    RevenueAction,
    RollupRevenueOutput,
    RollupRevenue,
    RollupRevenueProof,
};

class RollupRevenueOutput extends Struct({
    initialRevenueId: Field,
    initialRevenueInfoRoot: Field,
    initialActionState: Field,
    nextRevenueId: Field,
    nextRevenueInfoRoot: Field,
    nextActionState: Field,
}) {}

const RollupRevenue = ZkProgram({
    name: 'RollupRevenue',
    publicOutput: RollupRevenueOutput,
    methods: {
        firstStep: {
            privateInputs: [Field, Field, Field],
            async method(
                initialRevenueId: Field,
                initialRevenueInfoRoot: Field,
                initialActionState: Field
            ): Promise<RollupRevenueOutput> {
                return new RollupRevenueOutput({
                    initialRevenueId,
                    initialRevenueInfoRoot,
                    initialActionState,
                    nextRevenueId: initialRevenueId,
                    nextRevenueInfoRoot: initialRevenueInfoRoot,
                    nextActionState: initialActionState,
                });
            },
        },
        shareRevenueStep: {
            privateInputs: [
                SelfProof<Void, RollupRevenueOutput>,
                RevenueAction,
                RevenueLevel1Witness,
            ],
            async method(
                earlierProof: SelfProof<Void, RollupRevenueOutput>,
                revenueAction: RevenueAction,
                revenueLevel1Witness: RevenueLevel1Witness
            ): Promise<RollupRevenueOutput> {
                earlierProof.verify();

                revenueLevel1Witness
                    .calculateIndex()
                    .assertEquals(earlierProof.publicOutput.nextRevenueId);
                revenueLevel1Witness
                    .calculateRoot(Field(0))
                    .assertEquals(
                        earlierProof.publicOutput.nextRevenueInfoRoot
                    );

                const nextRevenueInfoRoot = revenueLevel1Witness.calculateRoot(
                    RevenueInfoStorage.calculateLeaf(revenueAction)
                );

                return new RollupRevenueOutput({
                    ...earlierProof.publicOutput,
                    nextRevenueId:
                        earlierProof.publicOutput.nextRevenueId.add(1),
                    nextRevenueInfoRoot,
                    nextActionState: Utils.updateActionState(
                        earlierProof.publicOutput.nextActionState,
                        [RevenueAction.toFields(revenueAction)]
                    ),
                });
            },
        },
    },
});

class RollupRevenueProof extends ZkProgram.Proof(RollupRevenue) {}

class RevenueContract extends SmartContract {
    @state(Field) revenueInfoRoot = State<Field>();
    @state(Field) nextRevenueId = State<Field>();
    @state(Field) actionState = State<Field>();
    @state(Field) zkAppRoot = State<Field>();

    reducer = Reducer({ actionType: RevenueAction });

    init(): void {
        super.init();
        this.nextRevenueId.set(Field(0));
        this.revenueInfoRoot.set(DefaultRootForRevenueTree);
        this.zkAppRoot.set(DefaultRootForZkAppTree);

        this.account.permissions.set({
            ...Permissions.default(),
            editState: Permissions.proofOrSignature(),
        });
    }

    @method async createRevenueRequest(revenueAction: RevenueAction) {
        // send revenue to this contract
        const sender = AccountUpdate.createSigned(
            this.sender.getAndRequireSignature()
        );
        sender.send({
            to: AccountUpdate.create(this.address),
            amount: revenueAction.amount,
        });

        this.reducer.dispatch(revenueAction);
    }

    @method async claimRevenueRequest(
        revenueId: Field,
        revenueInfo: RevenueInfo,
        revenueInfoWitness: RevenueLevel1Witness,
        nullifier: Field,
        nullifierWitness: NullifierLevel1Witness,
        investedAmount: UInt64,
        campaignClaimedAmount: UInt64,
        claimedAmountWitness: ClaimedAmountLevel1Witness,
        projectIndex: Field,
        fundingIndex: Field,
        nullifierInFundingWitness: RequesterLevel1Witness,
        projectIndexWitness: ProjectIndexLevel1Witness,
        receiver: PublicKey,
        requestContractRef: ZkAppRef,
        requesterContractRef: ZkAppRef,
        participationContractRef: ZkAppRef,
        treasuryManagerContractRef: ZkAppRef,
        nullifierContractRef: ZkAppRef
    ) {
        // check correct revenue info
        this.verifyRevenueInfo(
            revenueId,
            revenueInfo,
            revenueInfoWitness
        ).assertTrue();

        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();

        verifyZkApp(
            RevenueContract.name,
            participationContractRef,
            zkAppRoot,
            Field(ZkAppIndex.PARTICIPATION)
        );
        verifyZkApp(
            RevenueContract.name,
            requestContractRef,
            zkAppRoot,
            Field(ZkAppIndex.REQUEST)
        );
        verifyZkApp(
            RevenueContract.name,
            requesterContractRef,
            zkAppRoot,
            Field(ZkAppIndex.FUNDING_REQUESTER)
        );
        verifyZkApp(
            RevenueContract.name,
            nullifierContractRef,
            zkAppRoot,
            Field(ZkAppIndex.NULLIFIER)
        );
        verifyZkApp(
            RevenueContract.name,
            treasuryManagerContractRef,
            zkAppRoot,
            Field(ZkAppIndex.TREASURY_MANAGER)
        );

        // do this to check if they claimed
        const nullifierContract = new NullifierContract(
            nullifierContractRef.address
        );
        await nullifierContract.commit(
            nullifier,
            revenueInfo.projectId,
            revenueId,
            nullifierWitness
        );

        // check project index in participation
        const participationContract = new ParticipationContract(
            participationContractRef.address
        );
        participationContract
            .isValidProjectIndex(
                revenueInfo.campaignId,
                revenueInfo.projectId,
                projectIndex,
                projectIndexWitness
            )
            .assertTrue();

        const dimensionIndex = UInt8.from(projectIndex.sub(1));

        // verify if they have investedAmount
        const nullifierInFunding = DkgLibs.Requester.calculateCommitment(
            nullifier,
            UInt32.fromFields(revenueInfo.campaignId.toFields()),
            dimensionIndex,
            CustomScalar.fromUInt64(investedAmount)
        );
        const requesterContract = new RequesterContract(
            requesterContractRef.address
        );
        requesterContract.verifyCommitment(
            fundingIndex,
            nullifierInFunding,
            nullifierInFundingWitness
        );

        // verify total funded amount
        const treasuryManagerAddress = new TreasuryManagerContract(
            treasuryManagerContractRef.address
        );
        treasuryManagerAddress
            .checkClaimedAmount(
                revenueInfo.campaignId,
                dimensionIndex,
                campaignClaimedAmount,
                claimedAmountWitness
            )
            .assertTrue();

        // transfer money to receiver
        // @todo check overflow
        this.send({
            to: AccountUpdate.create(receiver),
            amount: revenueInfo.amount
                .mul(MINIMAL_MINA_UNIT)
                .mul(investedAmount)
                .div(campaignClaimedAmount),
        });
    }

    @method async rollup(rollupProjectProof: RollupRevenueProof) {
        const revenueInfoRoot = this.revenueInfoRoot.getAndRequireEquals();
        const nextRevenueId = this.nextRevenueId.getAndRequireEquals();
        const actionState = this.actionState.getAndRequireEquals();

        // check
        revenueInfoRoot.assertEquals(
            rollupProjectProof.publicOutput.initialRevenueInfoRoot
        );
        nextRevenueId.assertEquals(
            rollupProjectProof.publicOutput.initialRevenueId
        );
        actionState.assertEquals(
            rollupProjectProof.publicOutput.initialActionState
        );
        this.account.actionState
            .getAndRequireEquals()
            .assertEquals(rollupProjectProof.publicOutput.nextActionState);

        // set
        this.revenueInfoRoot.set(
            rollupProjectProof.publicOutput.nextRevenueInfoRoot
        );
        this.nextRevenueId.set(rollupProjectProof.publicOutput.nextRevenueId);
        this.account.actionState
            .getAndRequireEquals()
            .assertEquals(rollupProjectProof.publicOutput.nextActionState);
        this.actionState.set(rollupProjectProof.publicOutput.nextActionState);
    }

    verifyRevenueInfo(
        revenueId: Field,
        revenueInfo: RevenueInfo,
        revenueInfoWitness: RevenueLevel1Witness
    ): Bool {
        // check last revenueInfogit
        const onchainLastRevenueInfo =
            this.revenueInfoRoot.getAndRequireEquals();
        const revenueInfoIndex = revenueInfoWitness.calculateIndex();
        revenueInfoIndex.assertEquals(
            RevenueInfoStorage.calculateLevel1Index(revenueId)
        );
        return onchainLastRevenueInfo.equals(
            revenueInfoWitness.calculateRoot(
                RevenueInfoStorage.calculateLeaf(revenueInfo)
            )
        );
    }
}
