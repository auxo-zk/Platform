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
    UInt8,
    UInt32,
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

import { CustomScalar, ScalarDynamicArray, Utils } from '@auxo-dev/auxo-libs';

import { INSTANCE_LIMITS, MINIMAL_MINA_UNIT, ZkAppEnum } from '../Constants.js';

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
    VestingInfo,
    VestingInfoStorage,
    DefaultRootForVestingTree,
    VestingLevel1Witness,
} from '../storages/VestingStorage.js';

import {
    ProjectMemberLevel1Witness,
    ProjectMemberLevel2Witness,
    TreasuryAddressLevel1Witness,
} from '../storages/ProjectStorage.js';

import { ProjectContract } from './Project.js';
import { CampaignContract } from './Campaign.js';
import { CommitmentContract } from './Commitment.js';
import { ParticipationContract } from './Participation.js';

import { ProjectIndexLevel1Witness } from '../storages/ParticipationStorage.js';
import { CommitmentLevel1Witness } from '../storages/CommitmentStorage.js';
import { ExistedIndexFlag } from '../storages/FundingStorage.js';

export { VestingContract };

class VestingContract extends SmartContract {
    @state(Field) vestingInfoRoot = State<Field>();
    @state(Field) balanceRoot = State<Field>();
    @state(Field) receiveFundAddressHash = State<Field>();
    @state(Field) nextVestingId = State<Field>();
    @state(Field) zkAppRoot = State<Field>();

    init(): void {
        super.init();
        this.nextVestingId.set(Field(0));
        this.balanceRoot.set(DefaultRootForCampaignTree);
        this.vestingInfoRoot.set(DefaultRootForVestingTree);
        this.zkAppRoot.set(DefaultRootForZkAppTree);
    }

    @method async createVestingRequest(
        vestingInfo: VestingInfo,
        committeeId: Field,
        keyId: Field,
        vestingContractWitness: AddressWitness,
        vestingInfoWitness: VestingLevel1Witness,
        keyStatusWitness: DkgStorage.DKGStorage.DkgLevel1Witness,
        requesterContractRef: ZkAppRef,
        dkgContractRef: ZkAppRef
    ) {
        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            VestingContract.name,
            requesterContractRef,
            zkAppRoot,
            Field(ZkAppEnum.REQUESTER)
        );

        // @todo check caller is project owner

        // new vesting id
        const vestingId = this.nextVestingId.getAndRequireEquals();

        // check last vestingInfo
        const onchainLastVestingInfo =
            this.vestingInfoRoot.getAndRequireEquals();
        const vestingInfoIndex = vestingInfoWitness.calculateIndex();
        vestingInfoIndex.assertEquals(
            VestingInfoStorage.calculateLevel1Index(vestingId)
        );
        onchainLastVestingInfo.assertEquals(
            vestingInfoWitness.calculateRoot(Field(0))
        );
        // update new value: new vesting info
        this.vestingInfoRoot.set(
            vestingInfoWitness.calculateRoot(
                VestingInfoStorage.calculateLeaf(vestingInfo)
            )
        );
        // update next vesting id
        this.nextVestingId.set(vestingId.add(1));

        // verify key status
        const dkgContract = new DkgZkApp.DKG.DkgContract(
            dkgContractRef.address
        );
        dkgContract.verifyKeyStatus(
            new KeyStatusInput({
                committeeId: committeeId,
                keyId: keyId,
                status: Field(KeyStatus.ACTIVE),
                witness: keyStatusWitness,
            })
        );

        // create task requester
        const requesterContract = new RequesterContract(
            requesterContractRef.address
        );

        requesterContract.createTask(
            DkgStorage.DKGStorage.calculateKeyIndex(committeeId, keyId),
            vestingInfo.deadline, // @todo Check if this is starting or ending in requester contract
            new ZkAppRef({
                address: this.address,
                witness: vestingContractWitness,
            })
        );
    }

    @method async vote(
        type: Field, // 0: No, 1: Yes
        vestingInfo: VestingInfo,
        projectId: Field,
        projectIndex: Field,
        projectIndexWitness: ProjectIndexLevel1Witness,
        vestingId: Field,
        investedAmount: UInt64,
        fundingIndex: Field,
        nullifier: Field,
        committeeId: Field,
        keyId: Field,
        keyWitnessForRequester: DkgStorage.RequesterStorage.RequesterLevel1Witness,
        key: PublicKey,
        keyWitnessForDkg: DkgStorage.DKGStorage.DkgLevel1Witness,
        treasuryAddressWitness: TreasuryAddressLevel1Witness,
        vestingInfoWitness: VestingLevel1Witness,
        commitmentWitness: CommitmentLevel1Witness,
        commitmentInFundingWitness: RequesterLevel1Witness,
        fundingContractWitness: AddressWitness,
        dkgContractRef: ZkAppRef,
        projectContractRef: ZkAppRef,
        participationContractRef: ZkAppRef,
        requesterContractRef: ZkAppRef,
        requesterOfFundingContractRef: ZkAppRef,
        commitmentContractRef: ZkAppRef
    ) {
        // Only accept yes and no
        type.assertLessThan(2, 'Only accept Y/N');

        // check correct vesting info
        this.verifyVestingInfo(
            vestingId,
            vestingInfo,
            vestingInfoWitness
        ).assertTrue();

        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            VestingContract.name,
            participationContractRef,
            zkAppRoot,
            Field(ZkAppEnum.PARTICIPATION)
        );
        verifyZkApp(
            VestingContract.name,
            requesterOfFundingContractRef,
            zkAppRoot,
            Field(ZkAppEnum.REQUESTER_2)
        );
        verifyZkApp(
            VestingContract.name,
            requesterContractRef,
            zkAppRoot,
            Field(ZkAppEnum.REQUESTER)
        );
        verifyZkApp(
            VestingContract.name,
            commitmentContractRef,
            zkAppRoot,
            Field(ZkAppEnum.COMMITMENT)
        );

        const projectContract = new ProjectContract(projectContractRef.address);

        // check if the contract has the correct projectId
        projectContract.isValidTreasuryAddress(
            projectId,
            this.address,
            treasuryAddressWitness
        );

        // send commit
        const commitmentContract = new CommitmentContract(
            commitmentContractRef.address
        );
        await commitmentContract.commit(
            nullifier,
            projectId,
            vestingId,
            commitmentWitness
        );

        // check project index in participation
        const participationContract = new ParticipationContract(
            participationContractRef.address
        );
        participationContract
            .isValidProjectIndex(
                vestingInfo.campaignId,
                projectId,
                projectIndex,
                projectIndexWitness
            )
            .assertTrue();

        const dimensionIndex = UInt8.from(projectIndex.sub(1));

        // verify if invested
        const commitmentInFunding = DkgLibs.Requester.calculateCommitment(
            nullifier,
            UInt32.fromFields(vestingInfo.campaignId.toFields()),
            dimensionIndex,
            CustomScalar.fromUInt64(investedAmount)
        );
        const requesterOfFundingContract = new RequesterContract(
            requesterOfFundingContractRef.address
        );
        requesterOfFundingContract.verifyCommitment(
            fundingIndex,
            commitmentInFunding,
            commitmentInFundingWitness
        );

        // vote
        const requesterContract = new RequesterContract(
            requesterContractRef.address
        );
        // create random vector and nullifier
        const randomVector = Provable.witness(
            DkgLibs.Requester.RandomVector,
            () => {
                // @todo create random
                return new DkgLibs.Requester.RandomVector();
            }
        );
        const nullifiers = Provable.witness(
            DkgLibs.Requester.NullifierArray,
            () => {
                // @todo create random
                return new DkgLibs.Requester.NullifierArray();
            }
        );

        // only using the first element of the array: [investedAmount, ..., ...]
        // so the dimensionIndex will be [type, ..., ...]
        const secretVector = new DkgLibs.Requester.SecretVector();
        secretVector.set(Field(0), CustomScalar.fromUInt64(investedAmount));
        let dimensionIndexes = Provable.witness(Field, () => {
            return Utils.packNumberArray([Number(type.toBigInt())], 8);
        });
        // only need to verify first element
        Field.fromBits(dimensionIndexes.toBits().slice(0, 8)).assertEquals(
            type
        );

        await requesterContract.submitEncryption(
            UInt32.fromFields(vestingId.toFields()),
            DkgStorage.DKGStorage.calculateKeyIndex(committeeId, keyId),
            secretVector,
            randomVector,
            dimensionIndexes,
            nullifiers,
            key.toGroup(),
            keyWitnessForDkg,
            keyWitnessForRequester,
            new ZkAppRef({
                address: this.address,
                witness: fundingContractWitness,
            }),
            dkgContractRef
        );
    }

    @method async claimMileStoneFund() {}

    verifyVestingInfo(
        vestingId: Field,
        vestingInfo: VestingInfo,
        vestingInfoWitness: VestingLevel1Witness
    ): Bool {
        // check last vestingInfo
        const onchainLastVestingInfo =
            this.vestingInfoRoot.getAndRequireEquals();
        const vestingInfoIndex = vestingInfoWitness.calculateIndex();
        vestingInfoIndex.assertEquals(
            VestingInfoStorage.calculateLevel1Index(vestingId)
        );
        return onchainLastVestingInfo.equals(
            vestingInfoWitness.calculateRoot(
                VestingInfoStorage.calculateLeaf(vestingInfo)
            )
        );
    }
}
