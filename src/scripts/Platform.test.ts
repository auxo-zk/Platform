import {
    Cache,
    Field,
    Mina,
    PrivateKey,
    Provable,
    PublicKey,
    Reducer,
    SmartContract,
    fetchAccount,
    Scalar,
    Poseidon,
    Account,
    AccountUpdate,
    Group,
    MerkleMap,
    MerkleMapWitness,
    Bool,
} from 'o1js';
import 'dotenv/config.js';
import fs from 'fs/promises';
import { Config, Key } from './helper/config.js';
import {
    AddressStorage,
    EMPTY_ADDRESS_MT,
    ReduceStorage,
    getZkAppRef,
    ActionStatus,
} from '../contracts/SharedStorage.js';
import { ZkAppEnum, Contract } from '../constants.js';
import { getProfiler } from './helper/profiler.js';
import { IPFSHash, CustomScalar } from '@auxo-dev/auxo-libs';
import {
    ProjectContract,
    CreateProject,
    CreateProjectInput,
    ProjectAction,
} from '../contracts/Project.js';
import {
    MemberArray,
    MemberStorage,
    InfoStorage as ProjectInfoStorage,
    AddressStorage as PayeeStorage,
    EMPTY_LEVEL_2_TREE,
    Level2Witness,
} from '../contracts/ProjectStorage.js';
import mockProjectIpfs from './mock/projects.js';
import {
    CampaignContract,
    CreateCampaign,
    CreateCampaignInput,
    CampaignAction,
} from '../contracts/Campaign.js';
import {
    InfoStorage as CampaignInfoStorage,
    OwnerStorage,
    StatusStorage,
    ConfigStorage,
    StatusEnum,
} from '../contracts/CampaignStorage.js';
import mockCampaignIpfs from './mock/campaigns.js';
import {
    FundingContract,
    CreateReduceProof,
    CreateRollupProof,
    FundingAction,
    FundingInput,
} from '../contracts/Funding.js';
import {
    RequestIdStorage,
    ValueStorage,
    TotalFundStorage,
} from '../contracts/FundingStorage.js';
import {
    ParticipationContract,
    JoinCampaign,
    ParticipationAction,
    JoinCampaignInput,
} from '../contracts/Participation.js';
import {
    InfoStorage as ParticipationInfoStorage,
    CounterStorage,
    IndexStorage,
    EMPTY_LEVEL_1_TREE,
    EMPTY_LEVEL_1_COMBINED_TREE,
} from '../contracts/ParticipationStorage.js';
import mockParticipationIpfs from './mock/participations.js';
import {
    TreasuryContract,
    ClaimFund,
    TreasuryAction,
    ClaimFundInput,
    InvestVector,
} from '../contracts/Treasury.js';
import { ClaimedStorage } from '../contracts/TreasuryStorage.js';
import {
    ContractList,
    compile,
    deploy,
    fetchAllContract,
    proveAndSend,
    wait,
} from '../libs/utils.js';
import { CustomScalarArray, ZkApp } from '@auxo-dev/dkg';

describe('Platform test all', () => {
    const doProofs = false;
    const cache = Cache.FileSystem('./caches');
    const profiling = false;
    const logMemory = true;
    const fee = undefined;
    const PlatformProfiler = getProfiler('Benchmark Platform');
    const profiler = profiling ? PlatformProfiler : undefined;

    let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
    Mina.setActiveInstance(Local);

    let numProjects = 2; // test deploy number of project: 0 and 1
    let numCampaign = 2; // test deploy number of campaign: 0 and 1
    let arrayPublicKey = [
        // test data member of project
        Local.testAccounts[0].publicKey,
        Local.testAccounts[1].publicKey,
        Local.testAccounts[2].publicKey,
    ];
    let memberArray = new MemberArray(arrayPublicKey);

    let feePayerKey: Key = Local.testAccounts[0];
    let contracts: ContractList = {};
    let tx: any;

    // Campaign storage
    let projectContract: ProjectContract;
    let memberStorage = new MemberStorage();
    let projectInfoStorage = new ProjectInfoStorage();
    let payeeStorage = new PayeeStorage();
    let projectActions: ProjectAction[] = [];

    // Campaign storage
    let campaignContract: CampaignContract;
    let campaignInfoStorage = new CampaignInfoStorage();
    let ownerStorage = new OwnerStorage();
    let statusStorage = new StatusStorage();
    let configStorage = new ConfigStorage();
    let campaignAddressStorage = new AddressStorage();
    let campaignActions: CampaignAction[] = [];

    // Participation storage
    let participationContract: ParticipationContract;
    let participationInfoStorage = new ParticipationInfoStorage();
    let counterStorage = new CounterStorage();
    let indexStorage = new IndexStorage();
    let participationAddressStorage = new AddressStorage();
    let participationAction: ParticipationAction[] = [];

    // Funding storage
    let fundingContract: FundingContract;
    let fundingReduceStorage = new ReduceStorage();
    let sumRStorage = new ValueStorage();
    let sumMStorage = new ValueStorage();
    let totalFundStorage = new TotalFundStorage();
    let requestIdStorage = new RequestIdStorage();
    let fundingAddressStorage = new AddressStorage();
    let fundingAction: FundingAction[] = [];

    // Treasury storage
    let treasuryContract: TreasuryContract;
    let claimedStorage = new ClaimedStorage();
    let treasuryAddressStorage = new AddressStorage();
    let treasuryAction: TreasuryAction[] = [];

    beforeAll(async () => {
        let configJson: Config = JSON.parse(
            await fs.readFile('config.json', 'utf8')
        );
        await Promise.all(
            Object.keys(Contract)
                .filter((item) => isNaN(Number(item)))
                .map(async (e) => {
                    let config = configJson.deployAliases[e.toLowerCase()];
                    let keyBase58: { privateKey: string; publicKey: string } =
                        JSON.parse(await fs.readFile(config.keyPath, 'utf8'));
                    let key = {
                        privateKey: PrivateKey.fromBase58(keyBase58.privateKey),
                        publicKey: PublicKey.fromBase58(keyBase58.publicKey),
                    };
                    let contract = (() => {
                        switch (e.toLowerCase()) {
                            case Contract.PROJECT:
                                return new ProjectContract(key.publicKey);
                            case Contract.CAMPAIGN:
                                return new CampaignContract(key.publicKey);
                            case Contract.FUNDING:
                                return new FundingContract(key.publicKey);
                            case Contract.PARTICIPATION:
                                return new ParticipationContract(key.publicKey);
                            case Contract.TREASURY:
                                return new TreasuryContract(key.publicKey);
                            case Contract.REQUEST:
                                return new ZkApp.Request.RequestContract(
                                    key.publicKey
                                );
                            default:
                                return new SmartContract(key.publicKey);
                        }
                    })();

                    campaignAddressStorage.updateAddress(
                        AddressStorage.calculateIndex(ZkAppEnum[e]),
                        key.publicKey
                    );

                    participationAddressStorage.updateAddress(
                        AddressStorage.calculateIndex(ZkAppEnum[e]),
                        key.publicKey
                    );

                    fundingAddressStorage.updateAddress(
                        AddressStorage.calculateIndex(ZkAppEnum[e]),
                        key.publicKey
                    );

                    treasuryAddressStorage.updateAddress(
                        AddressStorage.calculateIndex(ZkAppEnum[e]),
                        key.publicKey
                    );

                    contracts[e.toLowerCase()] = {
                        name: e.toLowerCase(),
                        key: key,
                        contract: contract,
                        actionStates: [Reducer.initialActionState],
                    };
                })
        );
    });

    it('Compile all zkProgram and zkApp', async () => {
        console.log('Compile all zkProgram...');
        await compile(CreateProject, cache, logMemory, profiler);
        await compile(CreateCampaign, cache, logMemory, profiler);
        await compile(JoinCampaign, cache, logMemory, profiler);
        await compile(ClaimFund, cache, logMemory, profiler);
        await compile(ZkApp.Request.CreateRequest, cache, logMemory, profiler);
        await compile(CreateReduceProof, cache, logMemory, profiler);
        await compile(CreateRollupProof, cache, logMemory, profiler);

        if (doProofs) {
            console.log('Compile all contracts...');
            await compile(ProjectContract, cache, logMemory, profiler);
            await compile(CampaignContract, cache, logMemory, profiler);
            await compile(ParticipationContract, cache, logMemory, profiler);
            await compile(TreasuryContract, cache, logMemory, profiler);
            await compile(
                ZkApp.Request.RequestContract,
                cache,
                logMemory,
                profiler
            );
            await compile(FundingContract, cache, logMemory, profiler);
        } else {
            console.log('AnalyzeMethods all contracts...');
            ProjectContract.analyzeMethods();
            CampaignContract.analyzeMethods();
            ParticipationContract.analyzeMethods();
            TreasuryContract.analyzeMethods();
            ZkApp.Request.RequestContract.analyzeMethods();
            FundingContract.analyzeMethods();
        }
    });

    it('Deploy all', async () => {
        console.log('Deploying');
        // Deploy ProjectContract
        await deploy(contracts[Contract.PROJECT], [], feePayerKey, fee);

        // Deploy CampaignContract
        await deploy(
            contracts[Contract.CAMPAIGN],
            [['zkApps', campaignAddressStorage.root]],
            feePayerKey,
            fee
        );

        // Deploy ParticipationContract
        await deploy(
            contracts[Contract.PARTICIPATION],
            [['zkApps', participationAddressStorage.root]],
            feePayerKey,
            fee
        );

        // Deploy FundingContract
        await deploy(
            contracts[Contract.FUNDING],
            [['zkApps', fundingAddressStorage.root]],
            feePayerKey,
            fee
        );

        // Send money in FundingContract
        tx = await Mina.transaction(
            { sender: feePayerKey.publicKey, fee },
            () => {
                let feePayerAccount = AccountUpdate.createSigned(
                    feePayerKey.publicKey
                );
                feePayerAccount.send({
                    to: contracts[Contract.FUNDING].key.publicKey,
                    amount: 5 * 10 ** 9,
                }); // 5 Mina to send request - which cost 1
            }
        );
        await tx.prove();
        await tx.sign([feePayerKey.privateKey]).send();

        // Deploy RequestContract
        await deploy(contracts[Contract.REQUEST], [], feePayerKey, fee);

        // Deploy TreasuryContract
        let treasuryContract = contracts[Contract.TREASURY]
            .contract as TreasuryContract;
        tx = await Mina.transaction(
            { sender: feePayerKey.publicKey, fee },
            () => {
                let feePayerAccount = AccountUpdate.fundNewAccount(
                    feePayerKey.publicKey,
                    1
                );
                treasuryContract.deploy();
                treasuryContract.zkApps.set(treasuryAddressStorage.root);
                feePayerAccount.send({
                    to: contracts[Contract.TREASURY].key.publicKey,
                    amount: 10 * 10 ** 9,
                }); // 10 Mina for investor to claim
            }
        );
        await tx.prove();
        await tx
            .sign([
                feePayerKey.privateKey,
                contracts[Contract.TREASURY].key.privateKey,
            ])
            .send();

        console.log('Deploy done all');
    });

    xit('Send tx create project', async () => {
        projectContract = contracts[Contract.PROJECT]
            .contract as ProjectContract;

        for (let i = 0; i < numProjects; i++) {
            let createProjectInput = new CreateProjectInput({
                members: memberArray,
                ipfsHash: IPFSHash.fromString(mockProjectIpfs[0]),
                payeeAccount: PublicKey.fromBase58(
                    'B62qnk1is4cK94PCX1QTwPM1SxfeCF9CcN6Nr7Eww3JLDgvxfWdhR5S'
                ),
            });

            tx = await Mina.transaction(
                { sender: feePayerKey.publicKey, fee },
                () => {
                    projectContract.createProject(createProjectInput);
                }
            );

            await proveAndSend(
                tx,
                [feePayerKey],
                'ProjectContract',
                'createProject'
            );

            projectActions.push(
                new ProjectAction({
                    projectId: Field(-1),
                    members: createProjectInput.members,
                    ipfsHash: createProjectInput.ipfsHash,
                    payeeAccount: createProjectInput.payeeAccount,
                })
            );
        }
    });

    xit('Rollup project', async () => {
        let createProjectProof = await CreateProject.firstStep(
            projectContract.nextProjectId.get(),
            projectContract.memberTreeRoot.get(),
            projectContract.projectInfoTreeRoot.get(),
            projectContract.payeeTreeRoot.get(),
            projectContract.lastRolledUpActionState.get()
        );

        let tree1 = EMPTY_LEVEL_2_TREE();
        for (let i = 0; i < Number(memberArray.length); i++) {
            tree1.setLeaf(
                BigInt(i),
                MemberArray.hash(memberArray.get(Field(i)))
            );
        }

        for (let i = 0; i < numProjects; i++) {
            console.log('Step', i);
            createProjectProof = await CreateProject.nextStep(
                createProjectProof,
                projectActions[i],
                memberStorage.getLevel1Witness(
                    memberStorage.calculateLevel1Index(Field(i))
                ),
                projectInfoStorage.getLevel1Witness(
                    projectInfoStorage.calculateLevel1Index(Field(i))
                ),
                payeeStorage.getLevel1Witness(
                    payeeStorage.calculateLevel1Index(Field(i))
                )
            );

            // update storage:
            memberStorage.updateInternal(Field(i), tree1);
            projectInfoStorage.updateLeaf(
                { level1Index: Field(i) },
                projectInfoStorage.calculateLeaf(projectActions[i].ipfsHash)
            );
            payeeStorage.updateLeaf(
                { level1Index: Field(i) },
                payeeStorage.calculateLeaf(projectActions[i].payeeAccount)
            );
        }

        tx = await Mina.transaction(
            { sender: feePayerKey.publicKey, fee },
            () => {
                projectContract.rollup(createProjectProof);
            }
        );
        await proveAndSend(tx, [feePayerKey], 'ProjectContract', 'rollup');
    });

    xit('Send tx create campaign', async () => {
        campaignContract = contracts[Contract.CAMPAIGN]
            .contract as CampaignContract;

        for (let i = 0; i < numCampaign; i++) {
            let createCampaignInput = new CreateCampaignInput({
                ipfsHash: IPFSHash.fromString(mockCampaignIpfs[0]),
                committeeId: Field(i + 1),
                keyId: Field(i + 1),
            });
            tx = await Mina.transaction(
                { sender: feePayerKey.publicKey, fee },
                () => {
                    campaignContract.createCampaign(createCampaignInput);
                }
            );
            await proveAndSend(
                tx,
                [feePayerKey],
                Contract.CAMPAIGN,
                'createCampaign'
            );

            campaignActions.push(
                new CampaignAction({
                    campaignId: Field(-1),
                    ipfsHash: createCampaignInput.ipfsHash,
                    owner: feePayerKey.publicKey,
                    campaignStatus: Field(StatusEnum.APPLICATION),
                    committeeId: createCampaignInput.committeeId,
                    keyId: createCampaignInput.keyId,
                })
            );
        }
    });

    xit('Rollup campaign', async () => {
        let createCampaignProof = await CreateCampaign.firstStep(
            campaignContract.ownerTreeRoot.get(),
            campaignContract.infoTreeRoot.get(),
            campaignContract.statusTreeRoot.get(),
            campaignContract.configTreeRoot.get(),
            campaignContract.nextCampaignId.get(),
            campaignContract.lastRolledUpActionState.get()
        );

        for (let i = 0; i < numCampaign; i++) {
            console.log('Step', i);
            createCampaignProof = await CreateCampaign.createCampaign(
                createCampaignProof,
                campaignActions[i],
                ownerStorage.getLevel1Witness(
                    ownerStorage.calculateLevel1Index(Field(i))
                ),
                campaignInfoStorage.getLevel1Witness(
                    campaignInfoStorage.calculateLevel1Index(Field(i))
                ),
                statusStorage.getLevel1Witness(
                    statusStorage.calculateLevel1Index(Field(i))
                ),
                configStorage.getLevel1Witness(
                    configStorage.calculateLevel1Index(Field(i))
                )
            );

            // update storage:
            ownerStorage.updateLeaf(
                ownerStorage.calculateLeaf(campaignActions[i].owner),
                Field(i)
            );
            campaignInfoStorage.updateLeaf(
                campaignInfoStorage.calculateLeaf(campaignActions[i].ipfsHash),
                Field(i)
            );
            statusStorage.updateLeaf(
                statusStorage.calculateLeaf(StatusEnum.APPLICATION),
                Field(i)
            );
            configStorage.updateLeaf(
                configStorage.calculateLeaf({
                    committeeId: campaignActions[i].committeeId,
                    keyId: campaignActions[i].keyId,
                }),
                Field(i)
            );
        }

        tx = await Mina.transaction(
            { sender: feePayerKey.publicKey, fee },
            () => {
                campaignContract.rollup(createCampaignProof);
            }
        );
        await proveAndSend(tx, [feePayerKey], Contract.CAMPAIGN, 'rollup');
    });
});
