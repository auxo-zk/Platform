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
    ActionEnum,
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

    let payeeAccount = Local.testAccounts[9].publicKey;

    let investors: Key[] = [
        {
            privateKey: Local.testAccounts[1].privateKey,
            publicKey: Local.testAccounts[1].publicKey,
        },
        {
            privateKey: Local.testAccounts[2].privateKey,
            publicKey: Local.testAccounts[2].publicKey,
        },
    ];

    // total fund 0.02 = 2e7
    let secretVectors: CustomScalarArray[] = [
        new CustomScalarArray([
            CustomScalar.fromScalar(Scalar.from(1e7)),
            CustomScalar.fromScalar(Scalar.from(0n)),
            CustomScalar.fromScalar(Scalar.from(0n)),
            CustomScalar.fromScalar(Scalar.from(0n)),
        ]),
        new CustomScalarArray([
            CustomScalar.fromScalar(Scalar.from(0n)),
            CustomScalar.fromScalar(Scalar.from(1e7)),
            CustomScalar.fromScalar(Scalar.from(0n)),
            CustomScalar.fromScalar(Scalar.from(0n)),
        ]),
    ];

    let investVectors = InvestVector.from([
        Field(1e7),
        Field(1e7),
        Field(0),
        Field(0),
    ]);

    let randomsVectors: CustomScalarArray[] = [
        new CustomScalarArray([
            CustomScalar.fromScalar(Scalar.from(100n)),
            CustomScalar.fromScalar(Scalar.from(200n)),
            CustomScalar.fromScalar(Scalar.from(300n)),
            CustomScalar.fromScalar(Scalar.from(400n)),
        ]),
        new CustomScalarArray([
            CustomScalar.fromScalar(Scalar.from(500n)),
            CustomScalar.fromScalar(Scalar.from(600n)),
            CustomScalar.fromScalar(Scalar.from(700n)),
            CustomScalar.fromScalar(Scalar.from(800n)),
        ]),
    ];

    let randomPrivateKey = PrivateKey.fromBase58(
        'EKE3xkv6TyhxSzBPeiiAppDfKsJVp7gXS7iuS2RNj8TGJvvhG6FM'
    );
    let randomPublickey = randomPrivateKey.toPublicKey();

    // mock sumD value
    let sumD = ZkApp.Request.RequestVector.from([
        randomPublickey.toGroup(),
        randomPublickey.toGroup(),
        randomPublickey.toGroup(),
        randomPublickey.toGroup(),
    ]);

    let tempSumM = [];
    for (let i = 0; i < Number(investVectors.length); i++) {
        let temp = Group.generator.scale(
            Scalar.from(investVectors.get(Field(i)).toBigInt())
        );
        tempSumM.push(temp.add(sumD.get(Field(i))));
    }
    let sumM = ZkApp.Request.RequestVector.from(tempSumM);

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

    // contract request storage:
    let DStorage = new MerkleMap();

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

    it('Send tx create project', async () => {
        projectContract = contracts[Contract.PROJECT]
            .contract as ProjectContract;

        for (let i = 0; i < numProjects; i++) {
            let createProjectInput = new CreateProjectInput({
                members: memberArray,
                ipfsHash: IPFSHash.fromString(mockProjectIpfs[0]),
                payeeAccount,
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

    it('Rollup project', async () => {
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

    it('Send tx create campaign', async () => {
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
                    actionType: Field(ActionEnum.CREATE_CAMPAIGN),
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

    it('Rollup campaign', async () => {
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
                Field(i),
                ownerStorage.calculateLeaf(campaignActions[i].owner)
            );
            campaignInfoStorage.updateLeaf(
                Field(i),
                campaignInfoStorage.calculateLeaf(campaignActions[i].ipfsHash)
            );
            statusStorage.updateLeaf(
                Field(i),
                statusStorage.calculateLeaf(StatusEnum.APPLICATION)
            );
            configStorage.updateLeaf(
                Field(i),
                configStorage.calculateLeaf({
                    committeeId: campaignActions[i].committeeId,
                    keyId: campaignActions[i].keyId,
                })
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

    it('Join campaign', async () => {
        participationContract = contracts[Contract.PARTICIPATION]
            .contract as ParticipationContract;

        Provable.log('Onchain: ', participationContract.indexTreeRoot.get());

        let joinCampaignInput = [
            new JoinCampaignInput({
                campaignId: Field(0),
                projectId: Field(0),
                participationInfo: IPFSHash.fromString(
                    mockParticipationIpfs[0]
                ),
                indexWitness: indexStorage.getWitness(
                    indexStorage.calculateLevel1Index({
                        campaignId: Field(0),
                        projectId: Field(0),
                    })
                ),
                memberLv1Witness: memberStorage.getLevel1Witness(Field(0)), // project Id
                memberLv2Witness: new Level2Witness(
                    EMPTY_LEVEL_2_TREE().getWitness(0n)
                ), // temp value since contract hasn't check this
                // memberLv2Witness: memberStorage.getLevel2Witness(Field(0), Field(0)), // Field 0 = owner
                projectRef: participationAddressStorage.getZkAppRef(
                    ZkAppEnum.PROJECT,
                    contracts[Contract.PROJECT].contract.address
                ),
            }),
            new JoinCampaignInput({
                campaignId: Field(0),
                projectId: Field(1),
                participationInfo: IPFSHash.fromString(
                    mockParticipationIpfs[0]
                ),
                indexWitness: indexStorage.getWitness(
                    indexStorage.calculateLevel1Index({
                        campaignId: Field(0),
                        projectId: Field(1),
                    })
                ),
                memberLv1Witness: memberStorage.getLevel1Witness(Field(1)), // project Id
                memberLv2Witness: new Level2Witness(
                    EMPTY_LEVEL_2_TREE().getWitness(0n)
                ), // fake value since contract hasn't check this
                // memberLv2Witness: memberStorage.getLevel2Witness(Field(1), Field(0)), // Field 0 = owner
                projectRef: participationAddressStorage.getZkAppRef(
                    ZkAppEnum.PROJECT,
                    contracts[Contract.PROJECT].contract.address
                ),
            }),
        ];

        for (let i = 0; i < joinCampaignInput.length; i++) {
            tx = await Mina.transaction(
                { sender: feePayerKey.publicKey, fee },
                () => {
                    participationContract.joinCampaign(joinCampaignInput[i]);
                }
            );
            await proveAndSend(
                tx,
                [feePayerKey],
                Contract.PARTICIPATION,
                'joinCampaign'
            );

            participationAction.push(
                new ParticipationAction({
                    campaignId: joinCampaignInput[i].campaignId,
                    projectId: joinCampaignInput[i].projectId,
                    participationInfo: joinCampaignInput[i].participationInfo,
                    curApplicationInfoHash: Field(0),
                })
            );
        }
    });

    it('Rollup Join campaign', async () => {
        let joinCampaignProof = await JoinCampaign.firstStep(
            participationContract.indexTreeRoot.get(),
            participationContract.infoTreeRoot.get(),
            participationContract.counterTreeRoot.get(),
            participationContract.lastRolledUpActionState.get()
        );

        for (let i = 0; i < participationAction.length; i++) {
            console.log('Step', i);

            joinCampaignProof = await JoinCampaign.joinCampaign(
                joinCampaignProof,
                participationAction[i],
                indexStorage.getLevel1Witness(
                    indexStorage.calculateLevel1Index({
                        campaignId: participationAction[i].campaignId,
                        projectId: participationAction[i].projectId,
                    })
                ),
                participationInfoStorage.getLevel1Witness(
                    participationInfoStorage.calculateLevel1Index({
                        campaignId: participationAction[i].campaignId,
                        projectId: participationAction[i].projectId,
                    })
                ),
                Field(i), // current counter of campaign
                counterStorage.getLevel1Witness(
                    counterStorage.calculateLevel1Index(
                        participationAction[i].campaignId
                    )
                )
            );

            // update storage:
            indexStorage.updateLeaf(
                indexStorage.calculateLevel1Index({
                    campaignId: participationAction[i].campaignId,
                    projectId: participationAction[i].projectId,
                }),
                indexStorage.calculateLeaf(Field(i + 1)) // index start from 1
            );

            participationInfoStorage.updateLeaf(
                participationInfoStorage.calculateLevel1Index({
                    campaignId: participationAction[i].campaignId,
                    projectId: participationAction[i].projectId,
                }),
                participationInfoStorage.calculateLeaf(
                    participationAction[i].participationInfo
                )
            );
            counterStorage.updateLeaf(
                counterStorage.calculateLevel1Index(
                    participationAction[i].campaignId
                ),
                counterStorage.calculateLeaf(Field(i + 1))
            );
        }

        tx = await Mina.transaction(
            { sender: feePayerKey.publicKey, fee },
            () => {
                participationContract.rollup(joinCampaignProof);
            }
        );
        await proveAndSend(tx, [feePayerKey], Contract.PARTICIPATION, 'rollup');
    });

    xit('Fund project', async () => {
        fundingContract = contracts[Contract.FUNDING]
            .contract as FundingContract;
        let fundingInput = [
            new FundingInput({
                campaignId: Field(0),
                committeePublicKey: contracts[Contract.COMMITTEE].key.publicKey,
                secretVector: secretVectors[0],
                random: randomsVectors[0],
                treasuryContract: fundingAddressStorage.getZkAppRef(
                    ZkAppEnum.TREASURY,
                    contracts[Contract.TREASURY].contract.address
                ),
            }),
            new FundingInput({
                campaignId: Field(0),
                committeePublicKey: contracts[Contract.COMMITTEE].key.publicKey,
                secretVector: secretVectors[1],
                random: randomsVectors[1],
                treasuryContract: fundingAddressStorage.getZkAppRef(
                    ZkAppEnum.TREASURY,
                    contracts[Contract.TREASURY].contract.address
                ),
            }),
        ];

        let result: {
            R: ZkApp.Request.RequestVector;
            M: ZkApp.Request.RequestVector;
        };
        let investorNonce = [];
        for (let i = 0; i < investors.length; i++) {
            let investor = await fetchAccount({
                publicKey: investors[i].publicKey,
            });
            investorNonce.push(Number(investor.account?.nonce) - 1);
        }

        for (let i = 0; i < investors.length; i++) {
            tx = await Mina.transaction(
                { sender: investors[i].publicKey, fee },
                () => {
                    result = fundingContract.fund(fundingInput[i]);
                }
            );
            await proveAndSend(tx, [investors[i]], Contract.FUNDING, 'fund');

            let { R, M } = result!;

            let dimension = fundingInput[i].secretVector.length;
            let totalMinaInvest = Provable.witness(Field, () => {
                let curSum = 0n;
                for (let j = 0; j < dimension.toBigInt(); j++) {
                    curSum += fundingInput[i].secretVector
                        .get(Field(j))
                        .toScalar()
                        .toBigInt();
                }
                return Field(curSum);
            });

            fundingAction.push(
                new FundingAction({
                    campaignId: fundingInput[i].campaignId,
                    R,
                    M,
                    fundAmount: totalMinaInvest,
                })
            );
        }
    });

    xit('Rollup funding project', async () => {
        let lastActionState = fundingContract.actionState.get();
        await fetchAllContract(contracts, [Contract.FUNDING]);
        let fundingActionStates = contracts[Contract.FUNDING].actionStates;
        let index = fundingActionStates.findIndex((obj) =>
            Boolean(obj.equals(lastActionState))
        );

        console.log('Reduce funding...');

        let reduceFundingProof = await CreateReduceProof.firstStep(
            fundingContract.actionState.get(),
            fundingContract.actionStatus.get()
        );

        for (let i = 0; i < fundingAction.length; i++) {
            console.log('Step', i);
            reduceFundingProof = await CreateReduceProof.nextStep(
                reduceFundingProof,
                fundingAction[i],
                fundingReduceStorage.getWitness(
                    fundingActionStates[index + 1 + i]
                )
            );

            // update storage:
            fundingReduceStorage.updateLeaf(
                fundingReduceStorage.calculateIndex(
                    fundingActionStates[index + 1 + i]
                ),
                fundingReduceStorage.calculateLeaf(ActionStatus.REDUCED)
            );
        }

        tx = await Mina.transaction(
            { sender: feePayerKey.publicKey, fee },
            () => {
                fundingContract.reduce(reduceFundingProof);
            }
        );
        await proveAndSend(tx, [feePayerKey], Contract.FUNDING, 'reduce');

        await fetchAllContract(contracts, [Contract.FUNDING, Contract.REQUEST]);
        console.log('RollUp funding...');

        let rollUpFundingProof = await CreateRollupProof.firstStep(
            fundingAction[0].campaignId,
            secretVectors[0].length,
            fundingContract.actionStatus.get()
        );

        for (let i = 0; i < investors.length; i++) {
            console.log('Step', i);
            rollUpFundingProof = await CreateRollupProof.nextStep(
                rollUpFundingProof,
                fundingAction[i],
                fundingActionStates[index + i],
                fundingReduceStorage.getWitness(
                    fundingActionStates[index + 1 + i]
                )
            );
        }

        tx = await Mina.transaction(
            { sender: feePayerKey.publicKey, fee },
            () => {
                fundingContract.rollupRequest(
                    rollUpFundingProof,
                    Field(1), // committeeId
                    Field(1), // keyId
                    sumRStorage.getLevel1Witness(
                        sumRStorage.calculateLevel1Index(
                            fundingAction[0].campaignId
                        )
                    ),
                    sumMStorage.getLevel1Witness(
                        sumMStorage.calculateLevel1Index(
                            fundingAction[0].campaignId
                        )
                    ),
                    requestIdStorage.getLevel1Witness(
                        requestIdStorage.calculateLevel1Index(
                            fundingAction[0].campaignId
                        )
                    ),
                    totalFundStorage.getLevel1Witness(
                        requestIdStorage.calculateLevel1Index(
                            fundingAction[0].campaignId
                        )
                    ),
                    fundingAddressStorage.getZkAppRef(
                        ZkAppEnum.REQUEST,
                        contracts[Contract.REQUEST].contract.address
                    )
                );
            }
        );
        await proveAndSend(tx, [feePayerKey], Contract.FUNDING, '');
    });

    xit('Project claim fund from treasury', async () => {
        treasuryContract = contracts[Contract.TREASURY]
            .contract as TreasuryContract;

        let claimFundInput = [
            new ClaimFundInput({
                campaignId: Field(0),
                projectId: Field(0),
                requestId: Field(6969), //temp
                payeeAccount,
                M: sumM,
                D: sumD,
                DWitness: DStorage.getWitness(Field(6969)),
                investVector: investVectors,
                participationIndexWitness: indexStorage.getLevel1Witness(
                    indexStorage.calculateLevel1Index({
                        campaignId: Field(0),
                        projectId: Field(0),
                    })
                ),
                claimedIndex: claimedStorage.getLevel1Witness(
                    claimedStorage.calculateLevel1Index({
                        campaignId: Field(0),
                        projectId: Field(0),
                    })
                ),
                participationRef: treasuryAddressStorage.getZkAppRef(
                    ZkAppEnum.PARTICIPATION,
                    contracts[Contract.PARTICIPATION].contract.address
                ),
            }),
            new ClaimFundInput({
                campaignId: Field(0),
                projectId: Field(1),
                requestId: Field(6969),
                payeeAccount,
                M: sumM,
                D: sumD,
                DWitness: DStorage.getWitness(Field(6969)),
                investVector: investVectors,
                participationIndexWitness: indexStorage.getLevel1Witness(
                    indexStorage.calculateLevel1Index({
                        campaignId: Field(0),
                        projectId: Field(1),
                    })
                ),
                claimedIndex: claimedStorage.getLevel1Witness(
                    claimedStorage.calculateLevel1Index({
                        campaignId: Field(0),
                        projectId: Field(1),
                    })
                ),
                participationRef: treasuryAddressStorage.getZkAppRef(
                    ZkAppEnum.PARTICIPATION,
                    contracts[Contract.PARTICIPATION].contract.address
                ),
            }),
        ];

        for (let i = 0; i < claimFundInput.length; i++) {
            let balanceBefore = Number(Account(payeeAccount).balance.get());
            tx = await Mina.transaction(
                { sender: feePayerKey.publicKey, fee },
                () => {
                    treasuryContract.claimFund(claimFundInput[i]);
                }
            );
            await proveAndSend(
                tx,
                [feePayerKey],
                Contract.TREASURY,
                'claimFund'
            );
            let balanceAfter = Number(Account(payeeAccount).balance.get());
            console.log('Balance change: ', balanceBefore - balanceAfter);

            treasuryAction.push(
                new TreasuryAction({
                    campaignId: claimFundInput[i].campaignId,
                    projectId: claimFundInput[i].projectId,
                })
            );
        }
    });

    xit('Roll up funding contract', async () => {
        console.log('First step: ');
        let reduceFundingProof = await ClaimFund.firstStep(
            treasuryContract.claimedTreeRoot.get(),
            Reducer.initialActionState
        );

        console.log('Next step: ');

        for (let i = 0; i < treasuryAction.length; i++) {
            console.log('Step', i);
            reduceFundingProof = await ClaimFund.nextStep(
                reduceFundingProof,
                treasuryAction[i],
                claimedStorage.getWitness(
                    claimedStorage.calculateLevel1Index({
                        campaignId: treasuryAction[i].campaignId,
                        projectId: treasuryAction[i].projectId,
                    })
                )
            );

            // update storage:
            claimedStorage.updateLeaf(
                claimedStorage.calculateLevel1Index({
                    campaignId: treasuryAction[i].campaignId,
                    projectId: treasuryAction[i].projectId,
                }),
                claimedStorage.calculateLeaf(Bool(true))
            );
        }

        tx = await Mina.transaction(
            { sender: feePayerKey.publicKey, fee },
            () => {
                treasuryContract.rollup(reduceFundingProof);
            }
        );
        await proveAndSend(tx, [feePayerKey], Contract.TREASURY, 'rollup');
    });
});
