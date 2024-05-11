import {
    Field,
    Mina,
    PrivateKey,
    PublicKey,
    AccountUpdate,
    Reducer,
    Provable,
    UInt32,
    Scalar,
    Bool,
    UInt64,
    Group,
    Cache,
    fetchAccount,
    TokenId,
    TokenContract,
    UInt8,
    Poseidon,
    Account,
    VerificationKey,
} from 'o1js';
import {
    ProjectAction,
    ProjectContract,
    RollupProject,
} from '../contracts/Project';
import { ProjectMockData } from './mock/ProjectMockData';
import {
    DefaultRootForProjectTree,
    EMPTY_LEVEL_2_PROJECT_MEMBER_TREE,
    IpfsHashStorage as ProjectIpfsHashStorage,
    MemberArray,
    ProjectMemberStorage,
    ProjectActionEnum,
    TreasuryAddressStorage,
} from '../storages/ProjectStorage';
import { IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import { Action } from './interfaces/action.interface';
import { Utilities } from './utils';
import { INSTANCE_LIMITS, MINIMAL_MINA_UNIT, ZkAppEnum } from '../Constants';
import { Libs as DkgLibs, RequestContract, Storage } from '@auxo-dev/dkg';
import {
    ProjectCounterStorage,
    ProjectIndexStorage,
    IpfsHashStorage as ParticipationIpfsHashStorage,
} from '../storages/ParticipationStorage';
import {
    KeyIndexStorage,
    TimelineStorage,
    IpfsHashStorage as CampaignIpfsHashStorage,
    Timeline,
    CampaignTimelineStateEnum,
    DefaultRootForCampaignTree,
} from '../storages/CampaignStorage';
import {
    CampaignAction,
    CampaignContractMock,
    RollupCampaign,
} from '../contracts/Campaign';
import {
    ParticipationAction,
    ParticipationContractMock,
    RollupParticipation,
} from '../contracts/Participation';
import { ZkAppStorage } from '../storages/SharedStorage';
import {
    RollupTreasuryManager,
    TreasuryManagerAction,
    TreasuryManagerContract,
    TreasuryManagerContractMock,
} from '../contracts/TreasuryManager';
import {
    FundingAction,
    FundingContract,
    FundingContractMock,
    RollupFunding,
} from '../contracts/Funding';
import {
    AmountVector,
    DefaultRootForFundingTree,
    FundingInformation,
    FundingInformationStorage,
} from '../storages/FundingStorage';
import { CampaignMockData } from './mock/CampaignMockData';
import { ParticipationMockData } from './mock/ParticipationMockData';
import { FundingMockData } from './mock/FundingMockData';
import {
    CampaignStateEnum,
    CampaignStateStorage,
    ClaimedAmountStorage,
    DefaultRootForTreasuryManagerTree,
} from '../storages/TreasuryManagerStorage';
import { VestingContractMock } from '../contracts/Vesting';
import {
    VestingInfo,
    VestedAmountStorage,
    VestingInfoStorage,
    DefaultRootForVestingTree,
} from '../storages/VestingStorage';
import {
    CommitmentContract,
    RollupCommitment,
    RollupCommitmentProof,
} from '../contracts/Commitment';
import {
    CommitmentStorage,
    CommitmentLeaf,
    DefaultRootForCommitmentMap,
} from '../storages/CommitmentStorage';
import { ParticipationStorage } from '../storages';

let proofsEnabled = false;

describe('TreasuryManager', () => {
    const cache = Cache.FileSystem('./caches');

    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        zkAppStorage: ZkAppStorage,
        campaignContractPrivateKey: PrivateKey,
        campaignContractPublicKey: PublicKey,
        campaignContract: CampaignContractMock,
        projectContractPrivateKey: PrivateKey,
        projectContractPublicKey: PublicKey,
        projectContract: ProjectContract,
        participationContractPrivateKey: PrivateKey,
        participationContractPublicKey: PublicKey,
        participationContract: ParticipationContractMock,
        fundingContractPrivateKey: PrivateKey,
        fundingContractPublicKey: PublicKey,
        fundingContract: FundingContractMock,
        fundingTokenContract: FundingContractMock,
        treasuryManagerContractPrivateKey: PrivateKey,
        treasuryManagerContractPublicKey: PublicKey,
        treasuryManagerContract: TreasuryManagerContractMock,
        treasuryManagerTokenContract: TreasuryManagerContractMock,
        vestingContractPrivateKey: PrivateKey,
        vestingContractPublicKey: PublicKey,
        vestingContract: VestingContractMock,
        commitmentContractPrivateKey: PrivateKey,
        commitmentContractPublicKey: PublicKey,
        commitmentContract: CommitmentContract,
        dkgContractPrivateKey: PrivateKey,
        dkgContractPublicKey: PublicKey,
        requesterContractPrivateKey: PrivateKey,
        requesterContractPublicKey: PublicKey,
        requesterForVestingContractPrivateKey: PrivateKey,
        requesterForVestingContractPublicKey: PublicKey,
        requestContractPrivateKey: PrivateKey,
        requestContractPublicKey: PublicKey,
        treasuryPrivateKey: PrivateKey,
        treasuryPublicKey: PublicKey,
        vkVestingContact: VerificationKey;

    const Local = Mina.LocalBlockchain({ proofsEnabled });

    let nextCampaignId = Field(0);
    let nextFundingId = Field(0);

    const campaignTrees = {
        timelineTree: new TimelineStorage(),
        ipfsHashTree: new CampaignIpfsHashStorage(),
        keyIndexTree: new KeyIndexStorage(),
    };

    let nextProjectId = Field(0);
    const projectTrees = {
        memberTree: new ProjectMemberStorage(),
        ipfsHashTree: new ProjectIpfsHashStorage(),
        treasuryAddressTree: new TreasuryAddressStorage(),
    };

    const participationTrees = {
        projectIndexTree: new ProjectIndexStorage(),
        projectCounterTree: new ProjectCounterStorage(),
        ipfsHashTree: new ParticipationIpfsHashStorage(),
    };

    const fundingTrees = {
        fundingInformationTree: new FundingInformationStorage(),
    };

    const treasuryManagerTrees = {
        campaignStateTree: new CampaignStateStorage(),
        claimedAmountTree: new ClaimedAmountStorage(),
    };

    const vestingTrees = {
        vestedAmountTree: new VestedAmountStorage(),
        vestingInfoTree: new VestingInfoStorage(),
    };

    const commitmentTrees = {
        commitmentTree: new CommitmentStorage(),
    };

    const dkgTrees = {
        publicKeyTree: new Storage.DKGStorage.PublicKeyStorage(),
    };

    const requesterTrees = {
        keyIndexTree: new Storage.RequesterStorage.RequesterKeyIndexStorage(),
    };

    const requesterOfFundingTrees = {
        keyIndexTree: new Storage.RequesterStorage.RequesterKeyIndexStorage(),
    };

    const requestTrees = {
        taskIdTree: new Storage.RequestStorage.TaskIdStorage(),
        expirationTree: new Storage.RequestStorage.ExpirationStorage(),
        resultTree: new Storage.RequestStorage.ResultStorage(),
    };

    beforeAll(async () => {
        Mina.setActiveInstance(Local);
        await RollupCampaign.compile({ cache });
        await RollupProject.compile({ cache });
        await RollupParticipation.compile({ cache });
        await RollupFunding.compile({ cache });
        await RollupTreasuryManager.compile({ cache });
        await RollupCommitment.compile({ cache });

        vkVestingContact = (await VestingContractMock.compile({ cache }))
            .verificationKey;

        if (proofsEnabled) {
            await CampaignContractMock.compile({ cache });
            await ProjectContract.compile({ cache });
            await ParticipationContractMock.compile({ cache });
            await FundingContractMock.compile({ cache });
            await TreasuryManagerContractMock.compile({ cache });
            await CommitmentContract.compile({ cache });
        }

        ({ privateKey: deployerKey, publicKey: deployerAccount } =
            Local.testAccounts[0]);
        ({ privateKey: senderKey, publicKey: senderAccount } =
            Local.testAccounts[1]);
        ({ privateKey: treasuryPrivateKey, publicKey: treasuryPublicKey } =
            Local.testAccounts[2]);

        campaignContractPrivateKey = PrivateKey.random();
        campaignContractPublicKey = campaignContractPrivateKey.toPublicKey();
        campaignContract = new CampaignContractMock(campaignContractPublicKey);

        projectContractPrivateKey = PrivateKey.random();
        projectContractPublicKey = projectContractPrivateKey.toPublicKey();
        projectContract = new ProjectContract(projectContractPublicKey);

        participationContractPrivateKey = PrivateKey.random();
        participationContractPublicKey =
            participationContractPrivateKey.toPublicKey();
        participationContract = new ParticipationContractMock(
            participationContractPublicKey
        );

        fundingContractPrivateKey = PrivateKey.random();
        fundingContractPublicKey = fundingContractPrivateKey.toPublicKey();
        fundingContract = new FundingContractMock(fundingContractPublicKey);

        fundingTokenContract = new FundingContractMock(
            fundingContractPublicKey,
            TokenId.derive(fundingContractPublicKey)
        );

        treasuryManagerContractPrivateKey = PrivateKey.random();
        treasuryManagerContractPublicKey =
            treasuryManagerContractPrivateKey.toPublicKey();
        treasuryManagerContract = new TreasuryManagerContractMock(
            treasuryManagerContractPublicKey
        );

        treasuryManagerTokenContract = new TreasuryManagerContractMock(
            treasuryManagerContractPublicKey,
            TokenId.derive(fundingContractPublicKey)
        );

        dkgContractPrivateKey = PrivateKey.random();
        dkgContractPublicKey = dkgContractPrivateKey.toPublicKey();

        requesterContractPrivateKey = PrivateKey.random();
        requesterContractPublicKey = requesterContractPrivateKey.toPublicKey();

        requesterForVestingContractPrivateKey = PrivateKey.random();
        requesterForVestingContractPublicKey =
            requesterForVestingContractPrivateKey.toPublicKey();

        requestContractPrivateKey = PrivateKey.random();
        requestContractPublicKey = requestContractPrivateKey.toPublicKey();

        vestingContractPrivateKey = PrivateKey.random();
        vestingContractPublicKey = vestingContractPrivateKey.toPublicKey();
        vestingContract = new VestingContractMock(vestingContractPublicKey);

        commitmentContractPrivateKey = PrivateKey.random();
        commitmentContractPublicKey =
            commitmentContractPrivateKey.toPublicKey();
        commitmentContract = new CommitmentContract(
            commitmentContractPublicKey
        );

        zkAppStorage = Utilities.getZkAppStorage({
            campaignAddress: campaignContractPublicKey,
            projectAddress: projectContractPublicKey,
            participationAddress: participationContractPublicKey,
            fundingAddress: fundingContractPublicKey,
            treasuryManagerAddress: treasuryManagerContractPublicKey,
            dkgAddress: dkgContractPublicKey,
            requesterAddress: requesterContractPublicKey,
            requestAddress: requestContractPublicKey,
            vestingAddress: vestingContractPublicKey,
            commitmentAddress: commitmentContractPublicKey,
        });

        await localDeploy();
    });

    async function localDeploy() {
        const tx = await Mina.transaction(deployerAccount, async () => {
            AccountUpdate.fundNewAccount(deployerAccount, 7);
            await campaignContract.deploy();
            campaignContract['zkAppRoot'].set(zkAppStorage.root);

            await projectContract.deploy();
            projectContract['zkAppRoot'].set(zkAppStorage.root);
            projectContract['vkHashVestingContract'].set(vkVestingContact.hash);

            await participationContract.deploy();
            participationContract['zkAppRoot'].set(zkAppStorage.root);

            await fundingContract.deploy();
            fundingContract['zkAppRoot'].set(zkAppStorage.root);

            await treasuryManagerContract.deploy();
            treasuryManagerContract['zkAppRoot'].set(zkAppStorage.root);

            await treasuryManagerTokenContract.deploy();

            fundingContract.approve(treasuryManagerTokenContract.self);

            // await vestingContract.deploy(); // not matter

            await commitmentContract.deploy();
        });
        await tx.prove();
        await tx
            .sign([
                deployerKey,
                campaignContractPrivateKey,
                projectContractPrivateKey,
                participationContractPrivateKey,
                fundingContractPrivateKey,
                treasuryManagerContractPrivateKey,
                vestingContractPrivateKey,
                commitmentContractPrivateKey,
            ])
            .send();
    }

    describe('Test claim vesting', () => {
        let start: number,
            startParticipation: number,
            startFunding: number,
            startRequesting: number,
            timeline: Timeline;

        let projectCounter = Field(0);
        const campaignId = Field(0);
        const requestId = Field(0);
        const committeeId = Field(CampaignMockData[0].committeeId);
        const keyId = Field(CampaignMockData[0].keyId);
        const key = PrivateKey.random().toPublicKey();
        const totalAmounts: UInt64[] = [];
        let resultVector: UInt64[] = [
            new UInt64(0),
            new UInt64(0),
            new UInt64(0),
        ];

        beforeAll(async () => {
            start =
                Number(Mina.getNetworkConstants().genesisTimestamp.toBigInt()) +
                1000;
            startParticipation =
                start + CampaignMockData[0].timelinePeriod.preparation;
            startFunding =
                startParticipation +
                CampaignMockData[0].timelinePeriod.participation;
            startRequesting =
                startFunding + CampaignMockData[0].timelinePeriod.funding;
            timeline = new Timeline({
                startParticipation: new UInt64(startParticipation),
                startFunding: new UInt64(startFunding),
                startRequesting: new UInt64(startRequesting),
            });

            for (let i = 0; i < FundingMockData.length; i++) {
                const amounts = FundingMockData[i].amounts;
                const dimensionIndexes = FundingMockData[i].dimensionIndexes;
                for (let j = 0; j < amounts.length; j++) {
                    resultVector[dimensionIndexes[j]] = resultVector[
                        dimensionIndexes[j]
                    ].add(amounts[j]);
                }
            }
        });

        it('1. Create Campaign', async () => {
            const tx = await Mina.transaction(senderAccount, async () => {
                await campaignContract.createCampaign(
                    timeline,
                    IpfsHash.fromString(CampaignMockData[0].ipfsHash),
                    Field(CampaignMockData[0].committeeId),
                    Field(CampaignMockData[0].keyId),
                    // keyStatusTree.getWitness(Field(0)),
                    zkAppStorage.getWitness(Field(ZkAppEnum.CAMPAIGN)),
                    zkAppStorage.getZkAppRef(
                        ZkAppEnum.DKG,
                        dkgContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        ZkAppEnum.REQUESTER,
                        requesterContractPublicKey
                    )
                );
            });
            await tx.prove();
            await tx.sign([senderKey]).send();
            const actions: Action[] = (await Mina.fetchActions(
                campaignContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(1);
        });

        it('2. Rollup Campaign', async () => {
            const actions: Action[] = (await Mina.fetchActions(
                campaignContractPublicKey
            )) as Action[];
            const campaignAction = CampaignAction.fromFields(
                Utilities.stringArrayToFields(actions[0].actions[0])
            );

            campaignTrees.timelineTree.updateLeaf(
                nextCampaignId,
                TimelineStorage.calculateLeaf(campaignAction.timeline)
            );
            campaignTrees.ipfsHashTree.updateLeaf(
                nextCampaignId,
                CampaignIpfsHashStorage.calculateLeaf(campaignAction.ipfsHash)
            );
            campaignTrees.keyIndexTree.updateLeaf(
                nextCampaignId,
                KeyIndexStorage.calculateLeaf({
                    committeeId: campaignAction.committeeId,
                    keyId: campaignAction.keyId,
                })
            );
            nextCampaignId = nextCampaignId.add(1);

            const tx = await Mina.transaction(senderAccount, async () => {
                campaignContract.nextCampaignId.set(nextCampaignId);
                campaignContract.timelineRoot.set(
                    campaignTrees.timelineTree.root
                );
                campaignContract.ipfsHashRoot.set(
                    campaignTrees.ipfsHashTree.root
                );
                campaignContract.keyIndexRoot.set(
                    campaignTrees.keyIndexTree.root
                );
                campaignContract.actionState.set(
                    campaignContract.account.actionState.getAndRequireEquals()
                );
                campaignContract.self.requireSignature();
                AccountUpdate.attachToTransaction(campaignContract.self);
            });
            await tx.prove();
            await tx.sign([senderKey, campaignContractPrivateKey]).send();

            expect(nextCampaignId).toEqual(
                campaignContract.nextCampaignId.get()
            );
            expect(campaignTrees.timelineTree.root).toEqual(
                campaignContract.timelineRoot.get()
            );
            expect(campaignTrees.ipfsHashTree.root).toEqual(
                campaignContract.ipfsHashRoot.get()
            );
            expect(campaignTrees.keyIndexTree.root).toEqual(
                campaignContract.keyIndexRoot.get()
            );
            expect(campaignContract.account.actionState.get()).toEqual(
                campaignContract.actionState.get()
            );
        });

        it('3. Campaign time line state should be PREPARATION', async () => {
            Local.incrementGlobalSlot(1);
            expect(
                campaignContract.getCampaignTimelineState(
                    campaignId,
                    timeline,
                    campaignTrees.timelineTree.getLevel1Witness(campaignId)
                )
            ).toEqual(Field(CampaignTimelineStateEnum.PREPARATION));
        });

        it('4. Create first project', async () => {
            const members = new MemberArray();
            members.push(senderAccount);
            for (let i = 0; i < ProjectMockData[0].members.length; i++) {
                members.push(
                    PublicKey.fromBase58(ProjectMockData[0].members[i])
                );
            }
            const tx = await Mina.transaction(senderAccount, async () => {
                AccountUpdate.fundNewAccount(senderAccount, 1);
                await projectContract.createProjectWithVesting(
                    members,
                    IpfsHash.fromString(ProjectMockData[0].ipfsHash),
                    vestingContractPublicKey,
                    requesterForVestingContractPublicKey,
                    treasuryPublicKey,
                    vkVestingContact
                );
            });
            await tx.prove();
            await tx.sign([senderKey, vestingContractPrivateKey]).send();
            const actions: Action[] = (await Mina.fetchActions(
                projectContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(1);
        });

        it('4.5. Default root should be correct', async () => {
            expect(vestingContract.vestingBalanceRoot.get()).toEqual(
                DefaultRootForCampaignTree
            );
            expect(vestingContract.vestingInfoRoot.get()).toEqual(
                DefaultRootForVestingTree
            );
            expect(vestingContract.nextVestingId.get()).toEqual(Field(0));
            expect(commitmentContract.actionState.get()).toEqual(
                Reducer.initialActionState
            );
            expect(commitmentContract.commitmentRoot.get()).toEqual(
                DefaultRootForCommitmentMap
            );
        });

        it('5. Create second project', async () => {
            const members = new MemberArray();
            members.push(senderAccount);
            for (let i = 0; i < ProjectMockData[1].members.length; i++) {
                members.push(
                    PublicKey.fromBase58(ProjectMockData[1].members[i])
                );
            }
            const tx = await Mina.transaction(senderAccount, async () => {
                await projectContract.createProject(
                    members,
                    IpfsHash.fromString(ProjectMockData[1].ipfsHash),
                    vestingContractPublicKey
                );
            });
            await tx.prove();
            await tx.sign([senderKey]).send();
            const actions: Action[] = (await Mina.fetchActions(
                projectContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(2);
        });

        it('6. Rollup Project', async () => {
            const actions: Action[] = (await Mina.fetchActions(
                projectContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(2);

            for (let i = 0; i < actions.length; i++) {
                const action = actions[i];
                const projectAction = ProjectAction.fromFields(
                    Utilities.stringArrayToFields(action.actions[0])
                );

                const memberTreeLevel2 = EMPTY_LEVEL_2_PROJECT_MEMBER_TREE();
                memberTreeLevel2.setLeaf(
                    0n,
                    ProjectMemberStorage.calculateLeaf(senderAccount)
                );
                for (let i = 0; i < ProjectMockData[0].members.length; i++) {
                    memberTreeLevel2.setLeaf(
                        BigInt(i + 1),
                        ProjectMemberStorage.calculateLeaf(
                            PublicKey.fromBase58(ProjectMockData[0].members[i])
                        )
                    );
                }
                projectTrees.memberTree.updateInternal(
                    nextProjectId,
                    memberTreeLevel2
                );
                projectTrees.ipfsHashTree.updateLeaf(
                    { level1Index: nextProjectId },
                    ProjectIpfsHashStorage.calculateLeaf(projectAction.ipfsHash)
                );
                projectTrees.treasuryAddressTree.updateLeaf(
                    { level1Index: nextProjectId },
                    TreasuryAddressStorage.calculateLeaf(
                        projectAction.treasuryAddress
                    )
                );
                nextProjectId = nextProjectId.add(1);
            }
            const tx = await Mina.transaction(senderAccount, async () => {
                projectContract.nextProjectId.set(nextProjectId);
                projectContract.memberRoot.set(projectTrees.memberTree.root);
                projectContract.ipfsHashRoot.set(
                    projectTrees.ipfsHashTree.root
                );
                projectContract.treasuryAddressRoot.set(
                    projectTrees.treasuryAddressTree.root
                );
                projectContract.actionState.set(
                    projectContract.account.actionState.getAndRequireEquals()
                );
                projectContract.self.requireSignature();
                AccountUpdate.attachToTransaction(projectContract.self);
            });
            await tx.prove();
            await tx.sign([senderKey, projectContractPrivateKey]).send();

            expect(nextProjectId).toEqual(projectContract.nextProjectId.get());
            expect(projectTrees.memberTree.root).toEqual(
                projectContract.memberRoot.get()
            );
            expect(projectTrees.ipfsHashTree.root).toEqual(
                projectContract.ipfsHashRoot.get()
            );
            expect(projectTrees.treasuryAddressTree.root).toEqual(
                projectContract.treasuryAddressRoot.get()
            );
        });

        it('7. Campaign timeline state should be PARTICIPATION', async () => {
            Local.incrementGlobalSlot(1);
            expect(
                campaignContract.getCampaignTimelineState(
                    campaignId,
                    timeline,
                    campaignTrees.timelineTree.getLevel1Witness(campaignId)
                )
            ).toEqual(Field(CampaignTimelineStateEnum.PARTICIPATION));
        });

        it('8. First project join campaign', async () => {
            const projectId = Field(0);
            const projectMemberId = Field(0);

            const tx = await Mina.transaction(senderAccount, async () => {
                await participationContract.participateCampaign(
                    campaignId,
                    projectId,
                    IpfsHash.fromString(ParticipationMockData[0].ipfsHash),
                    timeline,
                    campaignTrees.timelineTree.getLevel1Witness(campaignId),
                    projectTrees.memberTree.getLevel1Witness(projectId),
                    projectTrees.memberTree.getLevel2Witness(
                        projectId,
                        projectMemberId
                    ),
                    participationTrees.projectIndexTree.getLevel1Witness(
                        ProjectIndexStorage.calculateLevel1Index({
                            campaignId: campaignId,
                            projectId: projectId,
                        })
                    ),
                    projectCounter,
                    participationTrees.projectCounterTree.getLevel1Witness(
                        ProjectCounterStorage.calculateLevel1Index(campaignId)
                    ),
                    zkAppStorage.getZkAppRef(
                        ZkAppEnum.CAMPAIGN,
                        campaignContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        ZkAppEnum.PROJECT,
                        projectContractPublicKey
                    )
                );
            });
            await tx.prove();
            await tx.sign([senderKey]).send();
            const actions: Action[] = (await Mina.fetchActions(
                participationContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(1);
        });

        it('9. Second project join campaign', async () => {
            const projectId = Field(1);
            const projectMemberId = Field(0);

            const tx = await Mina.transaction(senderAccount, async () => {
                await participationContract.participateCampaign(
                    campaignId,
                    projectId,
                    IpfsHash.fromString(ParticipationMockData[1].ipfsHash),
                    timeline,
                    campaignTrees.timelineTree.getLevel1Witness(campaignId),
                    projectTrees.memberTree.getLevel1Witness(projectId),
                    projectTrees.memberTree.getLevel2Witness(
                        projectId,
                        projectMemberId
                    ),
                    participationTrees.projectIndexTree.getLevel1Witness(
                        ProjectIndexStorage.calculateLevel1Index({
                            campaignId: campaignId,
                            projectId: projectId,
                        })
                    ),
                    projectCounter,
                    participationTrees.projectCounterTree.getLevel1Witness(
                        ProjectCounterStorage.calculateLevel1Index(campaignId)
                    ),
                    zkAppStorage.getZkAppRef(
                        ZkAppEnum.CAMPAIGN,
                        campaignContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        ZkAppEnum.PROJECT,
                        projectContractPublicKey
                    )
                );
            });
            await tx.prove();
            await tx.sign([senderKey]).send();
            const actions: Action[] = (await Mina.fetchActions(
                participationContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(2);
        });

        it('10. Rollup Participation', async () => {
            const actions: Action[] = (await Mina.fetchActions(
                participationContractPublicKey
            )) as Action[];
            for (let i = 0; i < actions.length; i++) {
                const action = actions[i];
                const participationAction = ParticipationAction.fromFields(
                    Utilities.stringArrayToFields(action.actions[0])
                );
                participationTrees.projectIndexTree.updateLeaf(
                    ProjectIndexStorage.calculateLevel1Index({
                        campaignId: campaignId,
                        projectId: participationAction.projectId,
                    }),
                    ProjectIndexStorage.calculateLeaf(projectCounter.add(1))
                );
                projectCounter = projectCounter.add(1);
                participationTrees.projectCounterTree.updateLeaf(
                    ProjectCounterStorage.calculateLevel1Index(campaignId),
                    projectCounter
                );
                participationTrees.ipfsHashTree.updateLeaf(
                    ParticipationIpfsHashStorage.calculateLevel1Index({
                        campaignId: campaignId,
                        projectId: participationAction.projectId,
                    }),
                    ParticipationIpfsHashStorage.calculateLeaf(
                        participationAction.ipfsHash
                    )
                );
            }
            const tx = await Mina.transaction(senderAccount, async () => {
                participationContract.projectIndexRoot.set(
                    participationTrees.projectIndexTree.root
                );
                participationContract.projectCounterRoot.set(
                    participationTrees.projectCounterTree.root
                );
                participationContract.ipfsHashRoot.set(
                    participationTrees.ipfsHashTree.root
                );
                participationContract.actionState.set(
                    participationContract.account.actionState.getAndRequireEquals()
                );
                participationContract.self.requireSignature();
                AccountUpdate.attachToTransaction(participationContract.self);
            });
            await tx.prove();
            await tx.sign([senderKey, participationContractPrivateKey]).send();
            expect(participationContract.projectIndexRoot.get()).toEqual(
                participationTrees.projectIndexTree.root
            );
            expect(participationContract.projectCounterRoot.get()).toEqual(
                participationTrees.projectCounterTree.root
            );
            expect(participationContract.ipfsHashRoot.get()).toEqual(
                participationTrees.ipfsHashTree.root
            );
        });

        it('11. Check valid project counter', async () => {
            expect(
                participationContract
                    .isValidProjectCounter(
                        campaignId,
                        projectCounter,
                        participationTrees.projectCounterTree.getLevel1Witness(
                            campaignId
                        )
                    )
                    .toField()
            ).toEqual(Bool(true).toField());
        });

        it('12. Project with projectId=0 should have projectIndex=1', async () => {
            const projectId = Field(0);
            const projectIndex = Field(1);
            expect(
                participationContract
                    .isValidProjectIndex(
                        campaignId,
                        projectId,
                        projectIndex,
                        participationTrees.projectIndexTree.getLevel1Witness(
                            ProjectIndexStorage.calculateLevel1Index({
                                campaignId: campaignId,
                                projectId: projectId,
                            })
                        )
                    )
                    .toField()
            ).toEqual(Bool(true).toField());
        });

        it('13. Project with projectId=1 should have projectIndex=2', async () => {
            const projectId = Field(1);
            const projectIndex = Field(2);
            expect(
                participationContract
                    .isValidProjectIndex(
                        campaignId,
                        projectId,
                        projectIndex,
                        participationTrees.projectIndexTree.getLevel1Witness(
                            ProjectIndexStorage.calculateLevel1Index({
                                campaignId: campaignId,
                                projectId: projectId,
                            })
                        )
                    )
                    .toField()
            ).toEqual(Bool(true).toField());
        });

        it('14. Campaign timeline state should be FUNDING', async () => {
            Local.incrementGlobalSlot(1);
            expect(
                campaignContract.getCampaignTimelineState(
                    campaignId,
                    timeline,
                    campaignTrees.timelineTree.getLevel1Witness(campaignId)
                )
            ).toEqual(Field(CampaignTimelineStateEnum.FUNDING));
        });

        it('15. Fund project', async () => {
            for (let i = 0; i < FundingMockData.length; i++) {
                const amountVector = new AmountVector();
                const balanceBefore =
                    treasuryManagerContract.account.balance.get();

                let totalAmount = new UInt64(0);
                for (let j = 0; j < FundingMockData[i].amounts.length; j++) {
                    const amount = new UInt64(FundingMockData[i].amounts[j]);
                    amountVector.push(amount);
                    totalAmount = totalAmount.add(amount);
                }
                totalAmounts.push(totalAmount);

                const tx = await Mina.transaction(senderAccount, async () => {
                    await fundingContract.fund(
                        campaignId,
                        timeline,
                        campaignTrees.timelineTree.getLevel1Witness(campaignId),
                        Utils.packNumberArray(
                            FundingMockData[i].dimensionIndexes,
                            8
                        ),
                        projectCounter,
                        participationTrees.projectCounterTree.getLevel1Witness(
                            campaignId
                        ),
                        committeeId,
                        keyId,
                        // requesterTrees.keyIndexTree.getLevel1Witness(Field(0)),
                        key,
                        // dkgTrees.publicKeyTree.getLevel1Witness(Field(0)),
                        amountVector,
                        new DkgLibs.Requester.RandomVector(),
                        new DkgLibs.Requester.NullifierArray(),
                        zkAppStorage.getWitness(Field(ZkAppEnum.FUNDING)),
                        zkAppStorage.getZkAppRef(
                            Field(ZkAppEnum.CAMPAIGN),
                            campaignContractPublicKey
                        ),
                        zkAppStorage.getZkAppRef(
                            Field(ZkAppEnum.PARTICIPATION),
                            participationContractPublicKey
                        ),
                        zkAppStorage.getZkAppRef(
                            Field(ZkAppEnum.DKG),
                            dkgContractPublicKey
                        ),
                        zkAppStorage.getZkAppRef(
                            Field(ZkAppEnum.TREASURY_MANAGER),
                            treasuryManagerContractPublicKey
                        ),
                        zkAppStorage.getZkAppRef(
                            Field(ZkAppEnum.REQUESTER),
                            requesterContractPublicKey
                        )
                    );
                });
                await tx.prove();
                await tx.sign([senderKey]).send();
                const actions: Action[] = (await Mina.fetchActions(
                    fundingContractPublicKey
                )) as Action[];
                expect(actions.length).toEqual(i + 1);

                const balanceAfter =
                    treasuryManagerContract.account.balance.get();
                expect(
                    balanceBefore.add(totalAmount.mul(MINIMAL_MINA_UNIT))
                ).toEqual(balanceAfter);
            }
        });

        it('16. Rollup Funding', async () => {
            const actions: Action[] = (await Mina.fetchActions(
                fundingContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(3);

            for (let i = 0; i < actions.length; i++) {
                const fundingAction = FundingAction.fromFields(
                    Utilities.stringArrayToFields(actions[i].actions[0])
                );

                fundingTrees.fundingInformationTree.updateLeaf(
                    nextFundingId,
                    FundingInformationStorage.calculateLeaf(
                        new FundingInformation({
                            campaignId: fundingAction.campaignId,
                            investor: fundingAction.investor,
                            amount: fundingAction.amount,
                        })
                    )
                );
                nextFundingId = nextFundingId.add(1);
            }

            const tx = await Mina.transaction(senderAccount, async () => {
                fundingContract.nextFundingId.set(nextFundingId);
                fundingContract.fundingInformationRoot.set(
                    fundingTrees.fundingInformationTree.root
                );
                fundingContract.actionState.set(
                    fundingContract.account.actionState.getAndRequireEquals()
                );
                fundingContract.self.requireSignature();
                AccountUpdate.attachToTransaction(fundingContract.self);
            });
            await tx.prove();
            await tx.sign([senderKey, fundingContractPrivateKey]).send();
            expect(fundingContract.nextFundingId.get()).toEqual(nextFundingId);
            expect(fundingContract.fundingInformationRoot.get()).toEqual(
                fundingTrees.fundingInformationTree.root
            );
        });

        it('17. Campaign state should be NOT_ENDED', async () => {
            expect(
                treasuryManagerContract
                    .isNotEnded(
                        campaignId,
                        treasuryManagerTrees.campaignStateTree.getLevel1Witness(
                            campaignId
                        )
                    )
                    .toField()
            ).toEqual(Bool(true).toField());
        });

        it('18. Campaign timeline state should be REQUESTING', async () => {
            Local.incrementGlobalSlot(1);
            expect(
                campaignContract.getCampaignTimelineState(
                    campaignId,
                    timeline,
                    campaignTrees.timelineTree.getLevel1Witness(campaignId)
                )
            ).toEqual(Field(CampaignTimelineStateEnum.REQUESTING));
        });

        it('19. Complete campaign', async () => {
            const tx = await Mina.transaction(senderAccount, async () => {
                await treasuryManagerContract.completeCampaign(
                    campaignId,
                    requestId,
                    timeline,
                    campaignTrees.timelineTree.getLevel1Witness(campaignId),
                    treasuryManagerTrees.campaignStateTree.getLevel1Witness(
                        campaignId
                    ),
                    // requestTrees.taskIdTree.getLevel1Witness(Field(0)),
                    new UInt64(0),
                    // requestTrees.expirationTree.getLevel1Witness(Field(0)),
                    // requestTrees.resultTree.getLevel1Witness(Field(0)),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.CAMPAIGN),
                        campaignContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.REQUESTER),
                        requesterContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.REQUEST),
                        requestContractPublicKey
                    )
                );
            });
            await tx.prove();
            await tx.sign([senderKey]).send();
            const actions: Action[] = (await Mina.fetchActions(
                treasuryManagerContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(1);
        });

        it('20. Rollup TreasuryManager', async () => {
            const actions: Action[] = (await Mina.fetchActions(
                treasuryManagerContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(1);
            // const treasuryManagerAction = TreasuryManagerAction.fromFields(
            //     Utilities.stringArrayToFields(actions[0].actions[0])
            // );

            treasuryManagerTrees.campaignStateTree.updateLeaf(
                campaignId,
                Field(CampaignStateEnum.COMPLETED)
            );

            const tx = await Mina.transaction(senderAccount, async () => {
                treasuryManagerContract.campaignStateRoot.set(
                    treasuryManagerTrees.campaignStateTree.root
                );
                treasuryManagerContract.actionState.set(
                    treasuryManagerContract.account.actionState.getAndRequireEquals()
                );
                treasuryManagerContract.self.requireSignature();
                AccountUpdate.attachToTransaction(treasuryManagerContract.self);
            });
            await tx.prove();
            await tx
                .sign([senderKey, treasuryManagerContractPrivateKey])
                .send();

            expect(treasuryManagerContract.campaignStateRoot.get()).toEqual(
                treasuryManagerTrees.campaignStateTree.root
            );
        });

        it('21. Campaign state should be COMPLETED', async () => {
            expect(
                treasuryManagerContract
                    .isCompleted(
                        campaignId,
                        treasuryManagerTrees.campaignStateTree.getLevel1Witness(
                            campaignId
                        )
                    )
                    .toField()
            ).toEqual(Bool(true).toField());
        });

        it('21. Claim fund for projectId=0', async () => {
            const projectId = Field(0);
            const projectIndex = Field(1);
            const balanceBefore = treasuryManagerContract.account.balance.get();
            const tx = await Mina.transaction(senderAccount, async () => {
                await treasuryManagerContract.claimFund(
                    campaignId,
                    projectId,
                    projectIndex,
                    participationTrees.projectIndexTree.getWitness(
                        ProjectIndexStorage.calculateLevel1Index({
                            campaignId,
                            projectId,
                        })
                    ),
                    requestId,
                    // requestTrees.taskIdTree.getLevel1Witness(Field(0)),
                    // requestTrees.resultTree.getLevel1Witness(Field(0)),
                    // requestTrees.resultTree.getLevel2Witness(Field(0), Field(0)),
                    vestingContractPublicKey,
                    projectTrees.treasuryAddressTree.getLevel1Witness(
                        projectId
                    ),
                    treasuryManagerTrees.claimedAmountTree.getLevel1Witness(
                        ClaimedAmountStorage.calculateLevel1Index({
                            campaignId: campaignId,
                            dimensionIndex: UInt8.from(projectIndex.sub(1)),
                        })
                    ),
                    totalAmounts[0],
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.PARTICIPATION),
                        participationContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.REQUEST),
                        requestContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.REQUESTER),
                        requesterContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.PROJECT),
                        projectContractPublicKey
                    )
                );
            });
            await tx.prove();
            await tx.sign([senderKey]).send();
            const actions: Action[] = (await Mina.fetchActions(
                treasuryManagerContractPublicKey
            )) as Action[];
            const balanceAfter = treasuryManagerContract.account.balance.get();
            expect(
                balanceBefore.sub(totalAmounts[0].mul(MINIMAL_MINA_UNIT))
            ).toEqual(balanceAfter);
            expect(actions.length).toEqual(2);
        });

        it('22. Claim fund for projectId=1', async () => {
            const projectId = Field(1);
            const projectIndex = Field(2);
            const balanceBefore = treasuryManagerContract.account.balance.get();
            const tx = await Mina.transaction(senderAccount, async () => {
                await treasuryManagerContract.claimFund(
                    campaignId,
                    projectId,
                    projectIndex,
                    participationTrees.projectIndexTree.getWitness(
                        ProjectIndexStorage.calculateLevel1Index({
                            campaignId,
                            projectId,
                        })
                    ),
                    requestId,
                    // requestTrees.taskIdTree.getLevel1Witness(Field(0)),
                    // requestTrees.resultTree.getLevel1Witness(Field(0)),
                    // requestTrees.resultTree.getLevel2Witness(Field(0), Field(0)),
                    vestingContractPublicKey,
                    projectTrees.treasuryAddressTree.getLevel1Witness(
                        projectId
                    ),
                    treasuryManagerTrees.claimedAmountTree.getLevel1Witness(
                        ClaimedAmountStorage.calculateLevel1Index({
                            campaignId: campaignId,
                            dimensionIndex: UInt8.from(projectIndex.sub(1)),
                        })
                    ),
                    totalAmounts[1],
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.PARTICIPATION),
                        participationContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.REQUEST),
                        requestContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.REQUESTER),
                        requesterContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.PROJECT),
                        projectContractPublicKey
                    )
                );
            });
            await tx.prove();
            await tx.sign([senderKey]).send();
            const actions: Action[] = (await Mina.fetchActions(
                treasuryManagerContractPublicKey
            )) as Action[];
            const balanceAfter = treasuryManagerContract.account.balance.get();
            expect(
                balanceBefore.sub(totalAmounts[1].mul(MINIMAL_MINA_UNIT))
            ).toEqual(balanceAfter);
            expect(actions.length).toEqual(3);
        });

        it('23. Rollup TreasuryManager', async () => {
            const actions: Action[] = (await Mina.fetchActions(
                treasuryManagerContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(3);

            for (let i = 0; i < 2; i++) {
                const action = actions[1 + i];
                const treasuryManagerAction = TreasuryManagerAction.fromFields(
                    Utilities.stringArrayToFields(action.actions[0])
                );

                treasuryManagerTrees.claimedAmountTree.updateLeaf(
                    ClaimedAmountStorage.calculateLevel1Index({
                        campaignId: treasuryManagerAction.campaignId,
                        dimensionIndex: UInt8.from(
                            treasuryManagerAction.projectIndex.sub(1)
                        ),
                    }),
                    ClaimedAmountStorage.calculateLeaf(
                        treasuryManagerAction.amount
                    )
                );
            }

            const tx = await Mina.transaction(senderAccount, async () => {
                treasuryManagerContract.claimedAmountRoot.set(
                    treasuryManagerTrees.claimedAmountTree.root
                );
                treasuryManagerContract.actionState.set(
                    treasuryManagerContract.account.actionState.getAndRequireEquals()
                );
                treasuryManagerContract.self.requireSignature();
                AccountUpdate.attachToTransaction(treasuryManagerContract.self);
            });
            await tx.prove();
            await tx
                .sign([senderKey, treasuryManagerContractPrivateKey])
                .send();

            expect(treasuryManagerContract.claimedAmountRoot.get()).toEqual(
                treasuryManagerTrees.claimedAmountTree.root
            );
        });

        it('24. Create Vesting Request', async () => {
            const vestingId = Field(0);
            const vestingInfo = new VestingInfo({
                campaignId,
                amount: new UInt64(10),
                deadline: new UInt64(0),
                claimed: Bool(false),
            });
            const tx = await Mina.transaction(senderAccount, async () => {
                await vestingContract.createVestingRequest(
                    vestingInfo,
                    vestingTrees.vestingInfoTree.getLevel1Witness(vestingId)
                );
            });
            await tx.prove();
            await tx.sign([senderKey]).send();

            vestingTrees.vestingInfoTree.updateLeaf(
                VestingInfoStorage.calculateLevel1Index(vestingId),
                VestingInfoStorage.calculateLeaf(vestingInfo)
            );

            expect(vestingContract.nextVestingId.get()).toEqual(Field(1));
            expect(vestingContract.vestingInfoRoot.get()).toEqual(
                vestingTrees.vestingInfoTree.root
            );
        });

        it('25. Vote in vesting', async () => {
            const type = Field(1);
            const projectId = Field(0);
            const projectIndex = Field(1);
            const investedAmount = new UInt64(5).mul(MINIMAL_MINA_UNIT); // = 1/2
            const nullifier = Field(69);
            const vestingId = Field(0);
            const vestingInfo = new VestingInfo({
                campaignId,
                amount: new UInt64(10),
                deadline: new UInt64(0),
                claimed: Bool(false),
            });

            const tx = await Mina.transaction(senderAccount, async () => {
                await vestingContract.vote(
                    type,
                    vestingInfo,
                    projectId,
                    projectIndex,
                    participationTrees.projectIndexTree.getLevel1Witness(
                        ProjectIndexStorage.calculateLevel1Index({
                            campaignId,
                            projectId,
                        })
                    ),
                    vestingId,
                    investedAmount,
                    nullifier,
                    projectTrees.treasuryAddressTree.getLevel1Witness(
                        TreasuryAddressStorage.calculateLevel1Index(projectId)
                    ),
                    vestingTrees.vestingInfoTree.getLevel1Witness(
                        VestingInfoStorage.calculateLevel1Index(vestingId)
                    ),
                    commitmentTrees.commitmentTree.getLevel1Witness(
                        CommitmentStorage.calculateLevel1Index({
                            nullifier,
                            projectId,
                            vestingId,
                        })
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.PROJECT),
                        projectContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.PARTICIPATION),
                        participationContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.COMMITMENT),
                        commitmentContractPublicKey
                    )
                );
            });
            await tx.prove();
            await tx.sign([senderKey]).send();

            const actions: Action[] = (await Mina.fetchActions(
                commitmentContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(1);
        });

        it('26. Claim vesting', async () => {
            const type = Field(1);
            const projectId = Field(0);
            const projectIndex = Field(1);
            const dimensionIndex = new UInt8(0); //= projectIndex - 1
            const investedAmount = new UInt64(6).mul(MINIMAL_MINA_UNIT); // = 1/2
            const votedYesAmount = new UInt64(6);
            const receiveFundAddress = treasuryPublicKey;
            const vestedAmount = new UInt64(0);
            const campaignClaimedAmount = new UInt64(10).mul(MINIMAL_MINA_UNIT);
            const nullifier = Field(69);
            const vestingId = Field(0);
            const vestingInfo = new VestingInfo({
                campaignId,
                amount: new UInt64(10),
                deadline: new UInt64(0),
                claimed: Bool(false),
            });
            const balanceBefore = Account(treasuryPublicKey).balance.get();
            const tx = await Mina.transaction(senderAccount, async () => {
                await vestingContract.claimMilestoneFund(
                    vestingInfo,
                    vestingId,
                    projectId,
                    projectIndex,
                    votedYesAmount,
                    campaignClaimedAmount,
                    receiveFundAddress,
                    vestedAmount,
                    vestingTrees.vestedAmountTree.getLevel1Witness(
                        VestedAmountStorage.calculateLevel1Index(campaignId)
                    ),
                    projectTrees.treasuryAddressTree.getLevel1Witness(
                        TreasuryAddressStorage.calculateLevel1Index(projectId)
                    ),
                    treasuryManagerTrees.claimedAmountTree.getLevel1Witness(
                        ClaimedAmountStorage.calculateLevel1Index({
                            campaignId,
                            dimensionIndex,
                        })
                    ),
                    participationTrees.projectIndexTree.getLevel1Witness(
                        ProjectIndexStorage.calculateLevel1Index({
                            campaignId,
                            projectId,
                        })
                    ),
                    vestingTrees.vestingInfoTree.getLevel1Witness(
                        VestingInfoStorage.calculateLevel1Index(vestingId)
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.PROJECT),
                        projectContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.PARTICIPATION),
                        participationContractPublicKey
                    ),
                    zkAppStorage.getZkAppRef(
                        Field(ZkAppEnum.TREASURY_MANAGER),
                        treasuryManagerContractPublicKey
                    )
                );
            });
            await tx.prove();
            await tx.sign([senderKey]).send();
            const balanceAfter = Account(treasuryPublicKey).balance.get();
            expect(
                balanceBefore.add(vestingInfo.amount.mul(MINIMAL_MINA_UNIT))
            ).toEqual(balanceAfter);

            const newVestingInfo = new VestingInfo({
                ...vestingInfo,
                claimed: Bool(true),
            });
            vestingTrees.vestingInfoTree.updateLeaf(
                VestingInfoStorage.calculateLevel1Index(vestingId),
                VestingInfoStorage.calculateLeaf(newVestingInfo)
            );
            expect(vestingContract.vestingInfoRoot.get()).toEqual(
                vestingTrees.vestingInfoTree.root
            );
        });
    });
});
