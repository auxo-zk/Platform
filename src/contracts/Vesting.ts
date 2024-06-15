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
    VestingInfo,
    VestingInfoStorage,
    VestedAmountStorage,
    DefaultRootForVestingTree,
    VestingLevel1Witness,
} from '../storages/VestingStorage.js';

import { TreasuryAddressLevel1Witness } from '../storages/ProjectStorage.js';

import { ClaimedAmountLevel1Witness } from '../storages/TreasuryManagerStorage.js';

import { ProjectContract } from './Project.js';
import { NullifierContract } from './Nullifier.js';
import { ParticipationContract } from './Participation.js';

import { ProjectIndexLevel1Witness } from '../storages/ParticipationStorage.js';
import { NullifierLevel1Witness } from '../storages/NullifierStorage.js';
import { TreasuryManagerContract } from './TreasuryManager.js';

export { VestingContract, VestingContractMock };

class VestingContract extends SmartContract {
    @state(Field) vestingInfoRoot = State<Field>();
    @state(Field) vestingBalanceRoot = State<Field>();
    @state(Field) receiveFundAddressHash = State<Field>();
    @state(Field) requesterForVestingAddressHash = State<Field>();
    @state(Field) nextVestingId = State<Field>();
    @state(Field) zkAppRoot = State<Field>();

    init(): void {
        super.init();
        this.nextVestingId.set(Field(0));
        this.vestingBalanceRoot.set(DefaultRootForCampaignTree);
        this.vestingInfoRoot.set(DefaultRootForVestingTree);
        this.zkAppRoot.set(DefaultRootForZkAppTree);

        this.account.permissions.set({
            ...Permissions.default(),
            editState: Permissions.proofOrSignature(),
        });
    }

    @method async createVestingRequest(
        vestingInfo: VestingInfo,
        committeeId: Field,
        keyId: Field,
        vestingContractWitness: AddressWitness,
        vestingInfoWitness: VestingLevel1Witness,
        keyStatusWitness: DkgStorage.DKGStorage.DkgLevel1Witness,
        dkgContractRef: ZkAppRef,
        requesterForVestingAddress: PublicKey
    ) {
        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            VestingContract.name,
            dkgContractRef,
            zkAppRoot,
            Field(ZkAppIndex.DKG)
        );

        const requesterForVestingAddressHash =
            this.requesterForVestingAddressHash.getAndRequireEquals();
        requesterForVestingAddressHash.assertEquals(
            Poseidon.hash(requesterForVestingAddress.toFields())
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

        // create task requester for vesting
        const requesterForVestingContract = new RequesterContract(
            requesterForVestingAddress
        );

        await requesterForVestingContract.createTask(
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
        nullifierWitness: NullifierLevel1Witness,
        nullifierInFundingWitness: RequesterLevel1Witness,
        fundingContractWitness: AddressWitness,
        dkgContractRef: ZkAppRef,
        projectContractRef: ZkAppRef,
        participationContractRef: ZkAppRef,
        requesterContractRef: ZkAppRef,
        nullifierContractRef: ZkAppRef,
        requesterForVestingAddress: PublicKey
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
            Field(ZkAppIndex.PARTICIPATION)
        );
        verifyZkApp(
            VestingContract.name,
            requesterContractRef,
            zkAppRoot,
            Field(ZkAppIndex.FUNDING_REQUESTER)
        );
        verifyZkApp(
            VestingContract.name,
            nullifierContractRef,
            zkAppRoot,
            Field(ZkAppIndex.NULLIFIER)
        );

        const projectContract = new ProjectContract(projectContractRef.address);

        // check if the contract has the correct projectId
        projectContract.isValidTreasuryAddress(
            projectId,
            this.address,
            treasuryAddressWitness
        );

        // send commit
        const nullifierContract = new NullifierContract(
            nullifierContractRef.address
        );
        await nullifierContract.commit(
            nullifier,
            projectId,
            vestingId,
            nullifierWitness
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

        // verify if they have invested
        const nullifierInFunding = DkgLibs.Requester.calculateCommitment(
            nullifier,
            UInt32.fromFields(vestingInfo.campaignId.toFields()),
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

        // vote
        const requesterForVestingAddressHash =
            this.requesterForVestingAddressHash.getAndRequireEquals();
        requesterForVestingAddressHash.assertEquals(
            Poseidon.hash(requesterForVestingAddress.toFields())
        );
        const requesterForVestingContract = new RequesterContract(
            requesterForVestingAddress
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

        await requesterForVestingContract.submitEncryption(
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

    @method async claimMilestoneFund(
        vestingInfo: VestingInfo,
        projectId: Field,
        vestingId: Field,
        requestId: Field,
        votedYesAmount: UInt64,
        projectIndex: Field,
        campaignClaimedAmount: UInt64,
        receiveFundAddress: PublicKey,
        vestedAmount: UInt64,
        vestingBalanceWitness: CampaignLevel1Witness,
        treasuryAddressWitness: TreasuryAddressLevel1Witness,
        claimedAmountWitness: ClaimedAmountLevel1Witness,
        projectIndexWitness: ProjectIndexLevel1Witness,
        vestingInfoWitness: VestingLevel1Witness,
        taskIdWitness: DkgStorage.RequestStorage.RequestLevel1Witness,
        resultVectorWitness: DkgStorage.RequestStorage.RequestLevel1Witness,
        resultValueWitness: DkgStorage.RequestStorage.RequestLevel2Witness,
        projectContractRef: ZkAppRef,
        participationContractRef: ZkAppRef,
        requestContractRef: ZkAppRef,
        treasuryManagerContractRef: ZkAppRef,
        requesterForVestingAddress: PublicKey
    ) {
        // check correct vesting info
        this.verifyVestingInfo(
            vestingId,
            vestingInfo,
            vestingInfoWitness
        ).assertTrue();

        vestingInfo.claimed.assertTrue(ErrorEnum.VES_MILESTONE_CLAIMED);

        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            VestingContract.name,
            participationContractRef,
            zkAppRoot,
            Field(ZkAppIndex.PARTICIPATION)
        );
        verifyZkApp(
            VestingContract.name,
            requestContractRef,
            zkAppRoot,
            Field(ZkAppIndex.REQUEST)
        );
        verifyZkApp(
            VestingContract.name,
            treasuryManagerContractRef,
            zkAppRoot,
            Field(ZkAppIndex.TREASURY_MANAGER)
        );

        const requesterForVestingAddressHash =
            this.requesterForVestingAddressHash.getAndRequireEquals();
        requesterForVestingAddressHash.assertEquals(
            Poseidon.hash(requesterForVestingAddress.toFields())
        );

        const projectContract = new ProjectContract(projectContractRef.address);

        // check if the contract has the correct projectId
        projectContract.isValidTreasuryAddress(
            projectId,
            this.address,
            treasuryAddressWitness
        );

        // verify  result
        const requestContract = new DkgZkApp.Request.RequestContract(
            requestContractRef.address
        );
        // Verify result right here
        requestContract.verifyTaskId(
            requestId,
            requesterForVestingAddress,
            UInt32.fromFields(vestingId.toFields()),
            taskIdWitness
        );
        requestContract.verifyResult(
            requestId,
            UInt8.from(1), // yes
            CustomScalar.fromUInt64(votedYesAmount).toScalar(),
            resultVectorWitness,
            resultValueWitness
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

        // verify  campaignClaimedAmount
        const treasuryManagerAddress = new TreasuryManagerContract(
            treasuryManagerContractRef.address
        );
        treasuryManagerAddress
            .checkClaimedAmount(
                vestingInfo.campaignId,
                dimensionIndex,
                campaignClaimedAmount,
                claimedAmountWitness
            )
            .assertTrue();

        let isMilestoneSuccess = votedYesAmount
            .mul(MINIMAL_MINA_UNIT)
            .mul(10000)
            .div(campaignClaimedAmount)
            .greaterThan(UInt64.from(THRESHOLD));

        isMilestoneSuccess.assertTrue(ErrorEnum.VES_MILESTONE_FAILED);

        // update vestingInfo
        const newVestingInfo = new VestingInfo({
            ...vestingInfo,
            ...{ claimed: Bool(true) },
        });
        this.vestingInfoRoot.set(
            vestingInfoWitness.calculateRoot(
                VestingInfoStorage.calculateLeaf(newVestingInfo)
            )
        );

        // check receive address
        const receiveFundAddressHash =
            this.receiveFundAddressHash.getAndRequireEquals();
        receiveFundAddressHash.assertEquals(
            Poseidon.hash(receiveFundAddress.toFields())
        );
        // check current balance
        const vestingBalanceRoot =
            this.vestingBalanceRoot.getAndRequireEquals();
        const vestingBalanceIndex = vestingBalanceWitness.calculateIndex();
        vestingBalanceIndex.assertEquals(
            VestedAmountStorage.calculateLevel1Index(vestingInfo.campaignId)
        );
        vestingBalanceRoot.assertEquals(
            vestingBalanceWitness.calculateRoot(
                VestedAmountStorage.calculateLeaf(vestedAmount)
            )
        );
        const newVestedAmount = vestedAmount.add(vestingInfo.amount);
        // check vestedAmount amount must be smaller than campaignClaimedAmount
        campaignClaimedAmount.assertGreaterThanOrEqual(
            newVestedAmount,
            ErrorEnum.VES_INSUFFICIENT_BALANCE
        );
        // update vestingBalanceRoot
        this.vestingBalanceRoot.set(
            vestingBalanceWitness.calculateRoot(
                VestedAmountStorage.calculateLeaf(newVestedAmount)
            )
        );
        // transfer money
        this.send({
            to: AccountUpdate.create(receiveFundAddress),
            amount: vestingInfo.amount.mul(MINIMAL_MINA_UNIT),
        });
    }

    verifyVestingInfo(
        vestingId: Field,
        vestingInfo: VestingInfo,
        vestingInfoWitness: VestingLevel1Witness
    ): Bool {
        // check last vestingInfogit
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

class VestingContractMock extends SmartContract {
    @state(Field) vestingInfoRoot = State<Field>();
    @state(Field) vestingBalanceRoot = State<Field>();
    @state(Field) receiveFundAddressHash = State<Field>();
    @state(Field) requesterForVestingAddressHash = State<Field>();
    @state(Field) nextVestingId = State<Field>();
    @state(Field) zkAppRoot = State<Field>();

    init(): void {
        super.init();
        this.nextVestingId.set(Field(0));
        this.vestingBalanceRoot.set(DefaultRootForCampaignTree);
        this.vestingInfoRoot.set(DefaultRootForVestingTree);
        this.zkAppRoot.set(DefaultRootForZkAppTree);

        this.account.permissions.set({
            ...Permissions.default(),
            editState: Permissions.proofOrSignature(),
        });
    }

    @method async createVestingRequest(
        vestingInfo: VestingInfo,
        // committeeId: Field,
        // keyId: Field,
        // vestingContractWitness: AddressWitness,
        vestingInfoWitness: VestingLevel1Witness
        // keyStatusWitness: DkgStorage.DKGStorage.DkgLevel1Witness,
        // requesterContractRef: ZkAppRef,
        // dkgContractRef: ZkAppRef
    ) {
        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        // verifyZkApp(
        //     VestingContract.name,
        //     requesterContractRef,
        //     zkAppRoot,
        //     Field(ZkAppIndex.REQUESTER)
        // );

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
        // const dkgContract = new DkgZkApp.DKG.DkgContract(
        //     dkgContractRef.address
        // );
        // dkgContract.verifyKeyStatus(
        //     new KeyStatusInput({
        //         committeeId: committeeId,
        //         keyId: keyId,
        //         status: Field(KeyStatus.ACTIVE),
        //         witness: keyStatusWitness,
        //     })
        // );

        // create task requester
        // const requesterContract = new RequesterContract(
        //     requesterContractRef.address
        // );

        // await requesterContract.createTask(
        //     DkgStorage.DKGStorage.calculateKeyIndex(committeeId, keyId),
        //     vestingInfo.deadline, // @todo Check if this is starting or ending in requester contract
        //     new ZkAppRef({
        //         address: this.address,
        //         witness: vestingContractWitness,
        //     })
        // );
    }

    @method async vote(
        type: Field, // 0: No, 1: Yes
        vestingInfo: VestingInfo,
        projectId: Field,
        projectIndex: Field,
        projectIndexWitness: ProjectIndexLevel1Witness,
        vestingId: Field,
        investedAmount: UInt64,
        // fundingIndex: Field,
        nullifier: Field,
        // committeeId: Field,
        // keyId: Field,
        // keyWitnessForRequester: DkgStorage.RequesterStorage.RequesterLevel1Witness,
        // key: PublicKey,
        // keyWitnessForDkg: DkgStorage.DKGStorage.DkgLevel1Witness,
        treasuryAddressWitness: TreasuryAddressLevel1Witness,
        vestingInfoWitness: VestingLevel1Witness,
        nullifierWitness: NullifierLevel1Witness,
        // nullifierInFundingWitness: RequesterLevel1Witness,
        // fundingContractWitness: AddressWitness,
        // dkgContractRef: ZkAppRef,
        projectContractRef: ZkAppRef,
        participationContractRef: ZkAppRef,
        // requesterContractRef: ZkAppRef,
        nullifierContractRef: ZkAppRef
        // requesterForVestingAddress: PublicKey
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
            Field(ZkAppIndex.PARTICIPATION)
        );
        // verifyZkApp(
        //     VestingContract.name,
        //     requesterContractRef,
        //     zkAppRoot,
        //     Field(ZkAppIndex.REQUESTER)
        // );
        verifyZkApp(
            VestingContract.name,
            nullifierContractRef,
            zkAppRoot,
            Field(ZkAppIndex.NULLIFIER)
        );

        const projectContract = new ProjectContract(projectContractRef.address);

        // check if the contract has the correct projectId
        projectContract.isValidTreasuryAddress(
            projectId,
            this.address,
            treasuryAddressWitness
        );

        // send commit
        const nullifierContract = new NullifierContract(
            nullifierContractRef.address
        );
        await nullifierContract.commit(
            nullifier,
            projectId,
            vestingId,
            nullifierWitness
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

        // const dimensionIndex = UInt8.from(projectIndex.sub(1));

        // verify if invested
        // const nullifierInFunding = DkgLibs.Requester.calculateNullifier(
        //     nullifier,
        //     UInt32.fromFields(vestingInfo.campaignId.toFields()),
        //     dimensionIndex,
        //     CustomScalar.fromUInt64(investedAmount)
        // );
        // const requesterContract = new RequesterContract(
        //     requesterContractRef.address
        // );
        // requesterContract.verifyNullifier(
        //     fundingIndex,
        //     nullifierInFunding,
        //     nullifierInFundingWitness
        // );

        // vote
        // const requesterForVestingAddressHash =
        //     this.requesterForVestingAddressHash.getAndRequireEquals();
        // requesterForVestingAddressHash.assertEquals(
        //     Poseidon.hash(requesterForVestingAddress.toFields())
        // );
        // const requesterForVestingContract = new RequesterContract(
        //     requesterForVestingAddress
        // );

        // create random vector and nullifier
        // const randomVector = Provable.witness(
        //     DkgLibs.Requester.RandomVector,
        //     () => {
        //         // @todo create random
        //         return new DkgLibs.Requester.RandomVector();
        //     }
        // );
        // const nullifiers = Provable.witness(
        //     DkgLibs.Requester.NullifierArray,
        //     () => {
        //         // @todo create random
        //         return new DkgLibs.Requester.NullifierArray();
        //     }
        // );

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

        // await requesterForVestingContract.submitEncryption(
        //     UInt32.fromFields(vestingId.toFields()),
        //     DkgStorage.DKGStorage.calculateKeyIndex(committeeId, keyId),
        //     secretVector,
        //     randomVector,
        //     dimensionIndexes,
        //     nullifiers,
        //     key.toGroup(),
        //     keyWitnessForDkg,
        //     keyWitnessForRequester,
        //     new ZkAppRef({
        //         address: this.address,
        //         witness: fundingContractWitness,
        //     }),
        //     dkgContractRef
        // );
    }

    @method async claimMilestoneFund(
        vestingInfo: VestingInfo,
        vestingId: Field,
        projectId: Field,
        projectIndex: Field,
        // requestId: Field,
        votedYesAmount: UInt64,
        campaignClaimedAmount: UInt64,
        receiveFundAddress: PublicKey,
        vestedAmount: UInt64,
        vestingBalanceWitness: CampaignLevel1Witness,
        treasuryAddressWitness: TreasuryAddressLevel1Witness,
        claimedAmountWitness: ClaimedAmountLevel1Witness,
        projectIndexWitness: ProjectIndexLevel1Witness,
        vestingInfoWitness: VestingLevel1Witness,
        // taskIdWitness: DkgStorage.RequestStorage.RequestLevel1Witness,
        // resultVectorWitness: DkgStorage.RequestStorage.RequestLevel1Witness,
        // resultValueWitness: DkgStorage.RequestStorage.RequestLevel2Witness,
        projectContractRef: ZkAppRef,
        participationContractRef: ZkAppRef,
        // requestContractRef: ZkAppRef,
        treasuryManagerContractRef: ZkAppRef
        // requesterForVestingAddress: PublicKey
    ) {
        // check correct vesting info
        this.verifyVestingInfo(
            vestingId,
            vestingInfo,
            vestingInfoWitness
        ).assertTrue();

        vestingInfo.claimed.assertFalse(ErrorEnum.VES_MILESTONE_CLAIMED);

        const zkAppRoot = this.zkAppRoot.getAndRequireEquals();
        verifyZkApp(
            VestingContract.name,
            participationContractRef,
            zkAppRoot,
            Field(ZkAppIndex.PARTICIPATION)
        );
        // verifyZkApp(
        //     VestingContract.name,
        //     requestContractRef,
        //     zkAppRoot,
        //     Field(ZkAppIndex.REQUEST)
        // );
        verifyZkApp(
            VestingContract.name,
            treasuryManagerContractRef,
            zkAppRoot,
            Field(ZkAppIndex.TREASURY_MANAGER)
        );

        // const requesterForVestingAddressHash =
        //     this.requesterForVestingAddressHash.getAndRequireEquals();
        // requesterForVestingAddressHash.assertEquals(
        //     Poseidon.hash(requesterForVestingAddress.toFields())
        // );

        const projectContract = new ProjectContract(projectContractRef.address);

        // check if the contract has the correct projectId
        projectContract.isValidTreasuryAddress(
            projectId,
            this.address,
            treasuryAddressWitness
        );

        // // verify  result
        // const requestContract = new DkgZkApp.Request.RequestContract(
        //     requestContractRef.address
        // );
        // // Verify result right here
        // requestContract.verifyTaskId(
        //     requestId,
        //     requesterOfFundingContractRef.address,
        //     UInt32.fromFields(vestingId.toFields()),
        //     taskIdWitness
        // );
        // requestContract.verifyResult(
        //     requestId,
        //     UInt8.from(1), // yes
        //     CustomScalar.fromUInt64(votedYesAmount).toScalar(),
        //     resultVectorWitness,
        //     resultValueWitness
        // );

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

        // verify  campaignClaimedAmount
        const treasuryManagerAddress = new TreasuryManagerContract(
            treasuryManagerContractRef.address
        );
        treasuryManagerAddress
            .checkClaimedAmount(
                vestingInfo.campaignId,
                dimensionIndex,
                campaignClaimedAmount,
                claimedAmountWitness
            )
            .assertTrue();

        Provable.log(
            '% check',
            votedYesAmount
                .mul(MINIMAL_MINA_UNIT)
                .mul(10000)
                .div(campaignClaimedAmount)
        );

        Provable.log('votedYesAmount', votedYesAmount);
        Provable.log('campaignClaimedAmount', campaignClaimedAmount);

        let isMilestoneSuccess = votedYesAmount
            .mul(MINIMAL_MINA_UNIT)
            .mul(10000)
            .div(campaignClaimedAmount)
            .greaterThanOrEqual(UInt64.from(THRESHOLD));

        isMilestoneSuccess.assertTrue(ErrorEnum.VES_MILESTONE_FAILED);

        // update vestingInfo
        const newVestingInfo = new VestingInfo({
            ...vestingInfo,
            ...{ claimed: Bool(true) },
        });
        this.vestingInfoRoot.set(
            vestingInfoWitness.calculateRoot(
                VestingInfoStorage.calculateLeaf(newVestingInfo)
            )
        );

        // check receive address
        const receiveFundAddressHash =
            this.receiveFundAddressHash.getAndRequireEquals();
        receiveFundAddressHash.assertEquals(
            Poseidon.hash(receiveFundAddress.toFields())
        );
        // check current balance
        const vestingBalanceRoot =
            this.vestingBalanceRoot.getAndRequireEquals();
        const vestingBalanceIndex = vestingBalanceWitness.calculateIndex();
        vestingBalanceIndex.assertEquals(
            VestedAmountStorage.calculateLevel1Index(vestingInfo.campaignId)
        );
        vestingBalanceRoot.assertEquals(
            vestingBalanceWitness.calculateRoot(
                VestedAmountStorage.calculateLeaf(vestedAmount)
            )
        );
        const newVestedAmount = vestedAmount.add(vestingInfo.amount);
        // check vestedAmount amount must be smaller than campaignClaimedAmount
        campaignClaimedAmount.assertGreaterThanOrEqual(
            newVestedAmount,
            ErrorEnum.VES_INSUFFICIENT_BALANCE
        );
        // update vestingBalanceRoot
        this.vestingBalanceRoot.set(
            vestingBalanceWitness.calculateRoot(
                VestedAmountStorage.calculateLeaf(newVestedAmount)
            )
        );
        // transfer money
        this.send({
            to: AccountUpdate.create(receiveFundAddress),
            amount: vestingInfo.amount.mul(MINIMAL_MINA_UNIT),
        });
    }

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
