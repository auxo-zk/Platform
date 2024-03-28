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
} from 'o1js';
import {
    ProjectAction,
    ProjectContract,
    RollupProject,
} from '../contracts/Project';
import {
    CampaignAction,
    CampaignContract,
    CampaignContractMock,
    RollupCampaign,
} from '../contracts/Campaign';
import {
    CampaignTimelineStateEnum,
    DefaultRootForCampaignTree,
    IpfsHashStorage as CampaignIpfsHashStorage,
    KeyIndexStorage,
    Timeline,
    TimelineStorage,
} from '../storages/CampaignStorage';
import { ProjectMockData } from './mock/ProjectMockData';
import {
    DefaultRootForProjectTree,
    MemberArray,
    ProjectMemberStorage,
    TreasuryAddressStorage,
    IpfsHashStorage as ProjectIpfsHashStorage,
    EMPTY_LEVEL_2_PROJECT_MEMBER_TREE,
} from '../storages/ProjectStorage';
import { IpfsHash } from '@auxo-dev/auxo-libs';
import { fetchActions, LocalBlockchain } from 'o1js/dist/node/lib/mina';
import { CampaignMockData } from './mock/CampaignMockData';
import { Action } from './interfaces/action.interface';
import { Utilities } from './utils';
import {
    ParticipationAction,
    ParticipationContract,
    ParticipationContractMock,
    RollupParticipation,
} from '../contracts/Participation';
import { ZkAppStorage } from '../storages/SharedStorage';
import {
    DefaultRootForParticipationTree,
    IpfsHashStorage as ParticipationIpfsHashStorage,
    ProjectCounterStorage,
    ProjectIndexStorage,
} from '../storages/ParticipationStorage';
import { Storage } from '@auxo-dev/dkg';
import { ZkAppEnum } from '../Constants';
import { ParticipationMockData } from './mock/ParticipationMockData';

let proofsEnabled = true;

describe('Participation', () => {
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
        dkgContractPrivateKey: PrivateKey,
        dkgContractPublicKey: PublicKey,
        requesterContractPrivateKey: PrivateKey,
        requesterContractPublicKey: PublicKey;

    const Local = Mina.LocalBlockchain({ proofsEnabled });

    let nextCampaignId = Field(0);
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

    const keyStatusTree = new Storage.DKGStorage.KeyStatusStorage();

    beforeAll(async () => {
        Mina.setActiveInstance(Local);
        ({ privateKey: deployerKey, publicKey: deployerAccount } =
            Local.testAccounts[0]);
        ({ privateKey: senderKey, publicKey: senderAccount } =
            Local.testAccounts[1]);

        await RollupCampaign.compile({ cache });
        await RollupProject.compile({ cache });
        await RollupParticipation.compile({ cache });
        if (proofsEnabled) {
            await CampaignContractMock.compile({ cache });
            await ProjectContract.compile({ cache });
            await ParticipationContractMock.compile({ cache });
        }

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

        dkgContractPrivateKey = PrivateKey.random();
        dkgContractPublicKey = dkgContractPrivateKey.toPublicKey();

        requesterContractPrivateKey = PrivateKey.random();
        requesterContractPublicKey = requesterContractPrivateKey.toPublicKey();

        zkAppStorage = Utilities.getZkAppStorage({
            campaignAddress: campaignContractPublicKey,
            projectAddress: projectContractPublicKey,
            participationAddress: participationContractPublicKey,
            dkgAddress: dkgContractPublicKey,
            requesterAddress: requesterContractPublicKey,
        });

        await localDeploy();
    });

    async function localDeploy() {
        const tx = await Mina.transaction(deployerAccount, () => {
            AccountUpdate.fundNewAccount(deployerAccount);
            campaignContract.deploy();
            campaignContract['zkAppRoot'].set(zkAppStorage.root);
            AccountUpdate.fundNewAccount(deployerAccount);
            projectContract.deploy();
            AccountUpdate.fundNewAccount(deployerAccount);
            participationContract.deploy();
            participationContract['zkAppRoot'].set(zkAppStorage.root);
        });
        await tx.prove();
        await tx
            .sign([
                deployerKey,
                campaignContractPrivateKey,
                projectContractPrivateKey,
                participationContractPrivateKey,
            ])
            .send();
    }

    it('Default root should be correct', async () => {
        expect(participationContract.projectIndexRoot.get()).toEqual(
            DefaultRootForParticipationTree
        );
        expect(participationContract.projectCounterRoot.get()).toEqual(
            DefaultRootForCampaignTree
        );
        expect(participationContract.ipfsHashRoot.get()).toEqual(
            DefaultRootForParticipationTree
        );
        expect(participationContract.zkAppRoot.get()).toEqual(
            zkAppStorage.root
        );
        expect(participationContract.actionState.get()).toEqual(
            Reducer.initialActionState
        );
    });

    describe('Test success flow', () => {
        let start: number,
            startParticipation: number,
            startFunding: number,
            startRequesting: number,
            timeline: Timeline;

        let projectCounter = Field(0);
        const campaignId = Field(0);

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
        });

        it('1. Create Campaign', async () => {
            const tx = await Mina.transaction(senderAccount, () => {
                campaignContract.createCampaign(
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
            const actions: Action[] = (await fetchActions(
                campaignContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(1);
        });

        it('2. Rollup Campaign', async () => {
            const actions: Action[] = (await fetchActions(
                campaignContractPublicKey
            )) as Action[];
            const campaignAction = CampaignAction.fromFields(
                Utilities.stringArrayToFields(actions[0].actions[0])
            );
            let proof = await RollupCampaign.firstStep(
                nextCampaignId,
                campaignTrees.timelineTree.root,
                campaignTrees.ipfsHashTree.root,
                campaignTrees.keyIndexTree.root,
                campaignContract.actionState.get()
            );
            proof = await RollupCampaign.createCampaignStep(
                proof,
                campaignAction,
                campaignTrees.timelineTree.getLevel1Witness(nextCampaignId),
                campaignTrees.ipfsHashTree.getLevel1Witness(nextCampaignId),
                campaignTrees.keyIndexTree.getLevel1Witness(nextCampaignId)
            );
            const tx = await Mina.transaction(senderAccount, () => {
                campaignContract.rollup(proof);
            });
            await tx.prove();
            await tx.sign([senderKey]).send();
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
            expect(campaignTrees.timelineTree.root).toEqual(
                campaignContract.timelineRoot.get()
            );
            expect(campaignTrees.ipfsHashTree.root).toEqual(
                campaignContract.ipfsHashRoot.get()
            );
            expect(campaignTrees.keyIndexTree.root).toEqual(
                campaignContract.keyIndexRoot.get()
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
            const tx = await Mina.transaction(senderAccount, () => {
                projectContract.createProject(
                    members,
                    IpfsHash.fromString(ProjectMockData[0].ipfsHash),
                    PublicKey.fromBase58(ProjectMockData[0].treasuryAddress)
                );
            });
            await tx.prove();
            await tx.sign([senderKey]).send();
            const actions: Action[] = (await fetchActions(
                projectContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(1);
        });

        it('5. Create second project', async () => {
            const members = new MemberArray();
            members.push(senderAccount);
            for (let i = 0; i < ProjectMockData[1].members.length; i++) {
                members.push(
                    PublicKey.fromBase58(ProjectMockData[1].members[i])
                );
            }
            const tx = await Mina.transaction(senderAccount, () => {
                projectContract.createProject(
                    members,
                    IpfsHash.fromString(ProjectMockData[1].ipfsHash),
                    PublicKey.fromBase58(ProjectMockData[1].treasuryAddress)
                );
            });
            await tx.prove();
            await tx.sign([senderKey]).send();
            const actions: Action[] = (await fetchActions(
                projectContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(2);
        });

        it('6. Rollup Project', async () => {
            const actions: Action[] = (await fetchActions(
                projectContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(2);

            let proof = await RollupProject.firstStep(
                nextProjectId,
                projectTrees.memberTree.root,
                projectTrees.ipfsHashTree.root,
                projectTrees.treasuryAddressTree.root,
                projectContract.actionState.get()
            );

            for (let i = 0; i < actions.length; i++) {
                const action = actions[i];
                const projectAction = ProjectAction.fromFields(
                    Utilities.stringArrayToFields(action.actions[0])
                );
                proof = await RollupProject.createProjectStep(
                    proof,
                    projectAction,
                    projectTrees.memberTree.getLevel1Witness(nextProjectId),
                    projectTrees.ipfsHashTree.getLevel1Witness(nextProjectId),
                    projectTrees.treasuryAddressTree.getLevel1Witness(
                        nextProjectId
                    )
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
            const tx = await Mina.transaction(senderAccount, () => {
                projectContract.rollup(proof);
            });
            await tx.prove();
            await tx.sign([senderKey]).send();
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

            const tx = await Mina.transaction(senderAccount, () => {
                participationContract.participateCampaign(
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
            const actions: Action[] = (await fetchActions(
                participationContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(1);
        });

        it('8. Second project join campaign', async () => {
            const projectId = Field(1);
            const projectMemberId = Field(0);

            const tx = await Mina.transaction(senderAccount, () => {
                participationContract.participateCampaign(
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
            const actions: Action[] = (await fetchActions(
                participationContractPublicKey
            )) as Action[];
            expect(actions.length).toEqual(2);
        });

        it('9. Rollup Participation', async () => {
            const actions: Action[] = (await fetchActions(
                participationContractPublicKey
            )) as Action[];
            let proof = await RollupParticipation.firstStep(
                participationTrees.projectIndexTree.root,
                participationTrees.projectCounterTree.root,
                participationTrees.ipfsHashTree.root,
                participationContract.actionState.get()
            );
            for (let i = 0; i < actions.length; i++) {
                const action = actions[i];
                const participationAction = ParticipationAction.fromFields(
                    Utilities.stringArrayToFields(action.actions[0])
                );
                proof = await RollupParticipation.participateCampaignStep(
                    proof,
                    participationAction,
                    projectCounter,
                    participationTrees.projectIndexTree.getLevel1Witness(
                        ProjectIndexStorage.calculateLevel1Index({
                            campaignId: campaignId,
                            projectId: participationAction.projectId,
                        })
                    ),
                    participationTrees.projectCounterTree.getLevel1Witness(
                        ProjectCounterStorage.calculateLevel1Index(campaignId)
                    ),
                    participationTrees.ipfsHashTree.getLevel1Witness(
                        ParticipationIpfsHashStorage.calculateLevel1Index({
                            campaignId: campaignId,
                            projectId: participationAction.projectId,
                        })
                    )
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
            const tx = await Mina.transaction(senderAccount, () => {
                participationContract.rollup(proof);
            });
            await tx.prove();
            await tx.sign([senderKey]).send();
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

        it('10. Check valid project counter', async () => {
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

        it('11. Project with projectId=0 should have projectIndex=1', async () => {
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

        it('12. Project with projectId=1 should have projectIndex=2', async () => {
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
    });
});
