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

import {
    ZkApp as DkgZkApp,
    Constants as DkgConstants,
    Storage as DkgStorage,
    RequesterContract,
    Libs as DkgLibs,
} from '@auxo-dev/dkg';

import { CustomScalar, ScalarDynamicArray, Utils } from '@auxo-dev/auxo-libs';

import { INSTANCE_LIMITS, MINIMAL_MINA_UNIT, ZkAppEnum } from '../Constants.js';

import {
    ZkAppRef,
    DefaultRootForZkAppTree,
    verifyZkApp,
} from '../storages/SharedStorage.js';

import {
    VestingInfo,
    VestingIdStorage,
    VestingInfoStorage,
    DefaultRootForVestingTree,
    DefaultRootForVestingCombineTree,
    VestingLevel1Witness,
    VestingLevel1CombineWitness,
} from '../storages/VestingStorage.js';

import {
    ProjectMemberLevel1Witness,
    ProjectMemberLevel2Witness,
    TreasuryAddressLevel1Witness,
} from '../storages/ProjectStorage.js';

import { ProjectContract } from './Project.js';
import { CampaignContract } from './Campaign.js';
import { ParticipationContract } from './Participation.js';

export { VestingContract };

class VestingContract extends SmartContract {
    @state(Field) vestingIdRoot = State<Field>();
    @state(Field) vestingInfoRoot = State<Field>();
    @state(Field) balanceRoot = State<Field>();
    @state(Field) receiveFundAddress = State<Field>();
    @state(Field) requesterOfFundingAddress = State<Field>();
    @state(Field) zkAppRoot = State<Field>();

    init(): void {
        super.init();
        this.vestingIdRoot.set(DefaultRootForVestingTree);
        this.balanceRoot.set(DefaultRootForVestingTree);
        this.vestingInfoRoot.set(DefaultRootForVestingCombineTree);
        this.zkAppRoot.set(DefaultRootForZkAppTree);
    }

    @method createVestingRequest(
        vestingInfo: VestingInfo,
        campaignId: Field,
        projectId: Field,
        lastVestingId: Field,
        memberWitnessLevel1: ProjectMemberLevel1Witness,
        memberWitnessLevel2: ProjectMemberLevel2Witness,
        treasuryAddressWitness: TreasuryAddressLevel1Witness,
        vestingIdWitness: VestingLevel1Witness,
        vestingInfoWitness: VestingLevel1CombineWitness,
        projectContractRef: ZkAppRef
    ) {
        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            VestingContract.name,
            projectContractRef,
            zkAppRoot,
            Field(ZkAppEnum.PROJECT)
        );

        const projectContract = new ProjectContract(projectContractRef.address);

        // check owner is caller
        projectContract.isOwner(
            projectId,
            memberWitnessLevel1,
            memberWitnessLevel2
        );

        // check if the contract has correct projectId
        projectContract.isValidTreasuryAddress(
            projectId,
            this.address,
            treasuryAddressWitness
        );

        // check last vestingId
        let onchainLastVestingId = this.vestingIdRoot.getAndRequireEquals();
        let vestingIdIndex = vestingIdWitness.calculateIndex();
        vestingIdIndex.assertEquals(
            VestingIdStorage.calculateLevel1Index(campaignId)
        );
        onchainLastVestingId.assertEquals(
            vestingIdWitness.calculateRoot(lastVestingId)
        );
        let newVestingId = lastVestingId.add(Field(1));
        // update new value: vestingId++
        this.vestingIdRoot.set(
            vestingIdWitness.calculateRoot(
                VestingIdStorage.calculateLeaf(newVestingId)
            )
        );

        // check last vestingInfo
        let onchainLastVestingInfo = this.vestingInfoRoot.getAndRequireEquals();
        let vestingInfoIndex = vestingIdWitness.calculateIndex();
        vestingInfoIndex.assertEquals(
            VestingInfoStorage.calculateLevel1Index({
                campaignId,
                vestingId: newVestingId,
            })
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
    }

    @method vote(
        campaignId: Field,
        projectId: Field,
        vestingId: Field,
        amount: UInt64,
        nullifier: DkgLibs.Requester.NullifierArray,
        treasuryAddressWitness: TreasuryAddressLevel1Witness,
        requesterOfFundingAddress: PublicKey,
        requesterContractRef: ZkAppRef,
        projectContractRef: ZkAppRef
    ) {}

    @method claimMileStoneFund() {}
}
