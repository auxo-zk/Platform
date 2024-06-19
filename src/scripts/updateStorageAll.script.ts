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
    Proof,
    Transaction,
    PendingTransaction,
    RejectedTransaction,
    IncludedTransaction,
    Keypair,
    SmartContract,
} from 'o1js';
import fs from 'fs';
import axios from 'axios';
import {
    ProjectAction,
    ProjectContract,
    RollupProject,
} from '../contracts/Project.js';
import { ProjectMockData } from './mock/ProjectMockData.js';
import {
    DefaultRootForProjectTree,
    EMPTY_LEVEL_2_PROJECT_MEMBER_TREE,
    IpfsHashStorage as ProjectIpfsHashStorage,
    MemberArray,
    ProjectMemberStorage,
    ProjectActionEnum,
    TreasuryAddressStorage,
} from '../storages/ProjectStorage.js';
import { IpfsHash, Utils, CustomScalar } from '@auxo-dev/auxo-libs';
import { Utilities } from './utils.js';
import {
    INSTANCE_LIMITS,
    MINIMAL_MINA_UNIT,
    ZkAppIndex,
} from '../Constants.js';
import {
    CommitteeContract,
    Libs as DkgLibs,
    RequesterAddressBook,
    Round2ContributionStorage,
    Storage,
} from '@auxo-dev/dkg';
import {
    ProjectCounterStorage,
    ProjectIndexStorage,
    IpfsHashStorage as ParticipationIpfsHashStorage,
} from '../storages/ParticipationStorage.js';
import {
    KeyIndexStorage,
    TimelineStorage,
    IpfsHashStorage as CampaignIpfsHashStorage,
    Timeline,
    CampaignTimelineStateEnum,
    DefaultRootForCampaignTree,
} from '../storages/CampaignStorage.js';
import {
    CampaignAction,
    CampaignContract,
    RollupCampaign,
} from '../contracts/Campaign.js';
import {
    ParticipationAction,
    ParticipationContract,
    RollupParticipation,
} from '../contracts/Participation.js';
import { ZkAppStorage } from '../storages/SharedStorage.js';
import {
    RollupTreasuryManager,
    TreasuryManagerAction,
    TreasuryManagerContract,
    TreasuryManagerContractMock,
} from '../contracts/TreasuryManager.js';
import {
    FundingAction,
    FundingContract,
    FundingContractMock,
    RollupFunding,
} from '../contracts/Funding.js';
import {
    AmountVector,
    DefaultRootForFundingTree,
    FundingInformation,
    FundingInformationStorage,
} from '../storages/FundingStorage.js';
import { CampaignMockData } from './mock/CampaignMockData.js';
import { ParticipationMockData } from './mock/ParticipationMockData.js';
import { FundingMockData } from './mock/FundingMockData.js';
import {
    CampaignStateEnum,
    CampaignStateStorage,
    ClaimedAmountStorage,
    DefaultRootForTreasuryManagerTree,
} from '../storages/TreasuryManagerStorage.js';

import { VestingContract } from '../contracts/Vesting.js';

import {
    DkgContract,
    RequestContract,
    RequesterContract,
    ResponseContract,
    UpdateKey,
    UpdateRequest,
    UpdateTask,
    ZkApp,
    Round1Contribution,
    Round2Contribution,
    SecretPolynomial,
    SecretVector,
    RandomVector,
    NullifierArray,
    SecretNote,
    ResponseContribution,
    ResponseContributionStorage,
    ResponseStorage,
    ProcessStorage,
    TimestampStorage,
    CommitmentStorage,
    RequesterKeyIndexStorage,
    RequesterAccumulationStorage,
    generateRandomPolynomial,
    getRound1Contribution,
    calculatePublicKeyFromContribution,
    getRound2Contribution,
    KeyStatus,
    KeyStorage,
    PublicKeyStorage,
    Round1ContributionStorage,
    EncryptionStorage,
} from '@auxo-dev/dkg';

import { prepare } from './helper/prepare.js';
import { Network } from './helper/config.js';
import { AddressStorage } from '@auxo-dev/dkg';
import { compile } from './helper/compile.js';
import { fetchAccounts } from './helper/index.js';
import { Action } from './interfaces/action.interface.js';

import 'dotenv/config';

type Logger = {
    info?: boolean;
    error?: boolean;
    memoryUsage?: boolean;
};

type TxResult = PendingTransaction | RejectedTransaction | IncludedTransaction;

async function sendTx(
    tx: Transaction,
    waitForBlock = true,
    logger?: Logger
): Promise<TxResult> {
    let retries = 3;
    let result;
    while (retries > 0) {
        try {
            result = await tx.send();
            if (waitForBlock)
                result = await (result as PendingTransaction).wait();
            if (logger && logger.info) console.log('Succeeded to send Tx!');
            return result;
        } catch (error) {
            retries--;
            if (logger && logger.error) {
                console.error('Failed to send Tx with errors:', error);
                console.log(`Retrying...`);
            }
        }
    }
    throw new Error(`Failed to send Tx after ${3} retries!`);
}

type Key = {
    privateKey: PrivateKey;
    publicKey: PublicKey;
};

type ZkApp = {
    key: Key;
    contract: SmartContract;
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initArgs?: Record<string, any>;
    actionStates: Field[];
    actions: Field[][];
    events: Field[][];
};

type FeePayer = {
    sender: Key;
    fee?: number | string | UInt64;
    memo?: string;
    nonce?: number;
};

const TX_FEE = 0.101 * 1e9;

async function fetchNonce(
    publicKey: PublicKey,
    logger?: Logger
): Promise<number | undefined> {
    try {
        let { account, error } = await fetchAccount({
            publicKey: publicKey,
        });
        if (account == undefined) throw error;
        return Number(account.nonce);
    } catch (error) {
        if (logger && logger.error) console.error(error);
    }
}

async function fixAddressState(
    zkApps: ZkApp[],
    feePayer: FeePayer,
    waitForBlock = true,
    logger?: Logger
): Promise<TxResult> {
    if (logger && logger.info) {
        console.log('Fixing addresses:');
        zkApps.map((e) => {
            console.log(`- ${e.name}`);
        });
    }

    let tx = await Mina.transaction(
        {
            sender: feePayer.sender.publicKey,
            fee: feePayer.fee || TX_FEE,
            memo: feePayer.memo,
            nonce: await fetchNonce(feePayer.sender.publicKey),
        },
        async () => {
            zkApps.map((e) => {
                Object.entries(e.initArgs ?? {}).map(([key, value]) =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (e.contract as any)[key].set(value)
                );
            });
        }
    );
    let result = await sendTx(
        await tx.sign([
            feePayer.sender.privateKey,
            ...zkApps.map((e) => e.key.privateKey),
        ]),
        waitForBlock,
        logger
    );
    if (logger && logger.info) console.log('Successfully changed!');
    return result;
}

async function main() {
    const doProofs = true;
    const logger = {
        info: true,
        debug: true,
        error: true,
    };

    let _ = await prepare(
        './caches',
        { type: Network.Lightnet, doProofs },
        {
            aliases: [
                'rollup',
                'committee',
                'dkg',
                'round1',
                'round2',
                'request',
                'response',
                'project',
                'campaign',
                'nullifier',
                'funding',
                'funding_requester',
                'vesting',
                'vesting_requester',
                'participation',
                'treasury_manager',
            ],
        }
    );

    //#region "Construct address books"
    const sharedAddressStorage = new AddressStorage();

    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.ROLLUP),
        _.accounts.rollup.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.COMMITTEE),
        _.accounts.committee.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.DKG),
        _.accounts.dkg.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.ROUND1),
        _.accounts.round1.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.ROUND2),
        _.accounts.round2.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.REQUEST),
        _.accounts.request.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.RESPONSE),
        _.accounts.response.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.PROJECT),
        _.accounts.project.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.CAMPAIGN),
        _.accounts.campaign.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.NULLIFIER),
        _.accounts.nullifier.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.FUNDING),
        _.accounts.funding.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.FUNDING_REQUESTER),
        _.accounts.funding_requester.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.PARTICIPATION),
        _.accounts.participation.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.TREASURY_MANAGER),
        _.accounts.treasury_manager.publicKey
    );

    const zkAppStorageForFundingRequester =
        Utilities.getZkAppStorageForRequester(
            _.accounts.campaign.publicKey.toBase58(),
            _.accounts.funding.publicKey.toBase58(),
            _.accounts.dkg.publicKey.toBase58(),
            _.accounts.request.publicKey.toBase58()
        );

    const zkAppStorageForVestingRequester =
        Utilities.getZkAppStorageForRequester(
            _.accounts.vesting.publicKey.toBase58(),
            _.accounts.campaign.publicKey.toBase58(),
            _.accounts.vesting.publicKey.toBase58(),
            _.accounts.request.publicKey.toBase58()
        );
    //#endregion

    Provable.log('zkApp: ', sharedAddressStorage.root);

    //#region "Prepare zkApps"
    let projectZkApp = Utils.getZkApp(
        _.accounts.project,
        new ProjectContract(_.accounts.project.publicKey),
        ProjectContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );
    let dkgZkApp = Utils.getZkApp(
        _.accounts.dkg,
        new DkgContract(_.accounts.dkg.publicKey),
        DkgContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let committeeZkApp = Utils.getZkApp(
        _.accounts.committee,
        new CommitteeContract(_.accounts.committee.publicKey),
        CommitteeContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let requestZkApp = Utils.getZkApp(
        _.accounts.request,
        new RequestContract(_.accounts.request.publicKey),
        RequestContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let responseZkApp = Utils.getZkApp(
        _.accounts.response,
        new ResponseContract(_.accounts.response.publicKey),
        ResponseContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let campaignZkApp = Utils.getZkApp(
        _.accounts.campaign,
        new CampaignContract(_.accounts.campaign.publicKey),
        CampaignContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let fundingZkApp = Utils.getZkApp(
        _.accounts.funding,
        new FundingContract(_.accounts.funding.publicKey),
        FundingContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let fundingRequesterZkApp = Utils.getZkApp(
        _.accounts.funding_requester,
        new RequesterContract(_.accounts.funding_requester.publicKey),
        RequesterContract.name,
        { zkAppRoot: zkAppStorageForFundingRequester.root }
    );

    // not this yet
    let vestingZkApp = {
        key: _.accounts.vesting,
        contract: new VestingContract(_.accounts.vesting.publicKey),
        name: VestingContract.name,
        initArgs: { zkAppRoot: sharedAddressStorage.root },
    };

    // not this yet
    let vestingRequesterZkApp = Utils.getZkApp(
        _.accounts.vesting_requester,
        new RequesterContract(_.accounts.vesting_requester.publicKey),
        RequesterContract.name,
        { zkAppRoot: zkAppStorageForVestingRequester.root }
    );

    let participationZkApp = Utils.getZkApp(
        _.accounts.participation,
        new ParticipationContract(_.accounts.participation.publicKey),
        ParticipationContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let treasuryManagerZkApp = Utils.getZkApp(
        _.accounts.treasury_manager,
        new TreasuryManagerContract(_.accounts.treasury_manager.publicKey),
        TreasuryManagerContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let requestZkAppWithRequesterToken = {
        ...requestZkApp,
        contract: new RequestContract(
            _.accounts.request.publicKey,
            TokenId.derive(_.accounts.funding_requester.publicKey)
        ),
    };

    let treasuryManagerTokenZkApp = Utils.getZkApp(
        _.accounts.treasury_manager,
        new TreasuryManagerContract(
            _.accounts.treasury_manager.publicKey,
            TokenId.derive(_.accounts.funding.publicKey)
        ),
        TreasuryManagerContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let fundingRequesterTokenZkAppForFunding = Utils.getZkApp(
        _.accounts.funding_requester,
        new RequesterContract(
            _.accounts.funding_requester.publicKey,
            TokenId.derive(_.accounts.funding.publicKey)
        ),
        RequesterContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let fundingRequesterTokenZkAppForCampaign = Utils.getZkApp(
        _.accounts.funding_requester,
        new RequesterContract(
            _.accounts.funding_requester.publicKey,
            TokenId.derive(_.accounts.campaign.publicKey)
        ),
        RequesterContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );
    //#endregion

    // compile all contract
    await compile(undefined, [], undefined, {
        error: true,
        info: true,
        memoryUsage: true,
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    //#region "Init trees for zkApps"
    const committeeTrees = {
        memberTree: new Storage.CommitteeStorage.MemberStorage(),
        settingTree: new Storage.CommitteeStorage.SettingStorage(),
        counterTree: new Storage.CommitteeStorage.KeyCounterStorage(),
    };

    const campaignTrees = {
        timelineTree: new TimelineStorage(),
        ipfsHashTree: new CampaignIpfsHashStorage(),
        keyIndexTree: new KeyIndexStorage(),
    };

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

    const dkgTrees = {
        encryptionTree: new EncryptionStorage(),
        round1ContributionTree: new Round1ContributionStorage(),
        round2ContributionTree: new Round2ContributionStorage(),
        publicKeyTree: new Storage.DKGStorage.PublicKeyStorage(),
        keyStatusTree: new Storage.DKGStorage.KeyStatusStorage(),
        keyTree: new Storage.DKGStorage.KeyStorage(),
    };

    const requestTrees = {
        taskIdTree: new Storage.RequestStorage.TaskStorage(),
        requestKeyIndexTree:
            new Storage.RequestStorage.RequestKeyIndexStorage(),
        taskTree: new Storage.RequestStorage.TaskStorage(),
        expirationTree: new Storage.RequestStorage.ExpirationStorage(),
        requestAccumulationTree:
            new Storage.RequestStorage.RequestAccumulationStorage(),
        resultTree: new Storage.RequestStorage.ResultStorage(),
    };

    const fundingRequesterTrees = {
        timestampTree: new TimestampStorage(),
        nullifierTree: new CommitmentStorage(),
        requesterKeyIndexTree: new RequesterKeyIndexStorage(),
        requesterAccumulationTree: new RequesterAccumulationStorage(),
    };

    const responseTrees = {
        responseTree: new ResponseStorage(),
        responseProcessTree: new ProcessStorage(),
        responseContributionTree: new ResponseContributionStorage(),
    };

    //#endregion

    //#region "Prepare data for test cases"
    let start: number,
        startParticipation: number,
        startFunding: number,
        startRequesting: number,
        timeline: Timeline,
        proof: any;

    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        treasuryPublicKey: PublicKey,
        treasuryPrivateKey: PrivateKey;

    ({ privateKey: deployerKey, publicKey: deployerAccount } = _.accounts[0]);
    ({ privateKey: senderKey, publicKey: senderAccount } = _.accounts[0]);
    ({ privateKey: treasuryPrivateKey, publicKey: treasuryPublicKey } =
        _.accounts[2]);

    let projectCounter = Field(0);
    let nextProjectId = Field(0);
    const campaignId = Field(0);
    const requestId = Field(0);
    const committeeId = Field(CampaignMockData[0].committeeId);
    const keyId = Field(CampaignMockData[0].keyId);
    const totalAmounts: UInt64[] = [];
    let nextCampaignId = Field(0);
    let nextFundingId = Field(0);

    let resultVector: UInt64[] = [new UInt64(0), new UInt64(0), new UInt64(0)];
    start = 0;
    startParticipation = start + CampaignMockData[0].timelinePeriod.preparation;
    startFunding =
        startParticipation + CampaignMockData[0].timelinePeriod.participation;
    startRequesting = startFunding + CampaignMockData[0].timelinePeriod.funding;
    timeline = new Timeline({
        startParticipation: new UInt64(startParticipation),
        startFunding: new UInt64(startFunding),
        startRequesting: new UInt64(startRequesting),
    });

    let mockSecret: any;
    let committees: {
        members: MemberArray;
        threshold: Field;
        ipfsHash: IpfsHash;
    }[] = [];
    let keys: {
        committeeId: Field;
        keyId: Field;
        key?: Group;
        round1Contributions?: Round1Contribution[];
        round2Contributions?: Round2Contribution[];
    }[] = [];
    let committeeSecrets: SecretPolynomial[] = [];
    const NUM_TASKS = 1;
    const SUBMISSION_PERIOD = 1.5 * 60 * 1000; //ms

    let requests: {
        taskId: UInt32;
        keyIndex: Field;
        requester: PublicKey;
        requestId: Field;
        submissionTs: UInt64;
        expirationTs: UInt64;
        R: Group[][];
        M: Group[][];
        D: Group[][];
        sumR: Group[];
        sumM: Group[];
        sumD: Group[];
        accumulationRootR?: Field;
        accumulationRootM?: Field;
        accumulationRootD?: Field;
        result: { [key: number]: bigint };
        encryptions: {
            indices: number[];
            packedIndices: Field;
            secrets: SecretVector;
            randoms: RandomVector;
            nullifiers: NullifierArray;
            R: Group[];
            M: Group[];
            notes: SecretNote[];
        }[];
        contributions: ResponseContribution[];
    }[] = [];

    for (let i = 0; i < FundingMockData.length; i++) {
        const amounts = FundingMockData[i].amounts;
        const dimensionIndexes = FundingMockData[i].dimensionIndexes;
        for (let j = 0; j < amounts.length; j++) {
            resultVector[dimensionIndexes[j]] = resultVector[
                dimensionIndexes[j]
            ].add(amounts[j]);
        }
    }

    let users = [_.accounts[0], _.accounts[1], _.accounts[2]];
    committees = [
        {
            members: new MemberArray([users[0].publicKey, users[1].publicKey]),
            threshold: Field(1),
            ipfsHash: IpfsHash.fromString(
                'QmdZyvZxREgPctoRguikD1PTqsXJH3Mg2M3hhRhVNSx4tn'
            ),
        },
    ];
    keys = [
        {
            committeeId,
            keyId,
        },
    ];

    // Calculate mock committee trees
    for (let i = 0; i < committees.length; i++) {
        let committee = committees[i];
        for (let j = 0; j < Number(committee.members.length); j++)
            committeeTrees.memberTree.updateRawLeaf(
                {
                    level1Index: Field(i),
                    level2Index: Field(j),
                },
                committee.members.get(Field(j))
            );

        committeeTrees.settingTree.updateRawLeaf(
            { level1Index: Field(i) },
            {
                T: committees[i].threshold,
                N: Field(committee.members.length),
            }
        );
    }

    // Calculate mock dkg trees
    let committee = committees[Number(committeeId)];
    let T = Number(committee.threshold);
    let N = Number(committee.members.length);
    keys[0].round1Contributions = [];
    keys[0].round2Contributions = [];
    let filename = `src/scripts/mock/secrets-${T}-${N}.json`;
    let isMockSecretsUsed = fs.existsSync(filename);
    if (isMockSecretsUsed) {
        mockSecret = JSON.parse(fs.readFileSync(filename, 'utf8'));
    }
    for (let j = 0; j < N; j++) {
        let secret = isMockSecretsUsed
            ? {
                  a: mockSecret.secrets[j].a.map((e: any) => Scalar.from(e)),
                  C: mockSecret.secrets[j].C.map(
                      (e: any) => new Group({ x: e.x, y: e.y })
                  ),
                  f: mockSecret.secrets[j].f.map((e: any) => Scalar.from(e)),
              }
            : generateRandomPolynomial(T, N);
        committeeSecrets.push(secret);
        let round1Contribution = getRound1Contribution(secret);
        keys[0].round1Contributions.push(round1Contribution);
        dkgTrees.round1ContributionTree.updateRawLeaf(
            {
                level1Index: Round1ContributionStorage.calculateLevel1Index({
                    committeeId,
                    keyId,
                }),
                level2Index: Round1ContributionStorage.calculateLevel2Index(
                    Field(j)
                ),
            },
            round1Contribution
        );
        dkgTrees.publicKeyTree.updateRawLeaf(
            {
                level1Index: PublicKeyStorage.calculateLevel1Index({
                    committeeId,
                    keyId,
                }),
                level2Index: PublicKeyStorage.calculateLevel2Index(Field(j)),
            },
            secret.C[0]
        );
    }
    keys[0].key = calculatePublicKeyFromContribution(
        keys[0].round1Contributions
    );
    for (let j = 0; j < N; j++) {
        let randoms = isMockSecretsUsed
            ? mockSecret.randoms[j]
            : [...Array(N)].map(() => Scalar.random());
        let round2Contribution = getRound2Contribution(
            committeeSecrets[j],
            j,
            keys[0].round1Contributions,
            randoms.map((e: string) => Scalar.from(e))
        );
        keys[0].round2Contributions.push(round2Contribution);

        dkgTrees.round2ContributionTree.updateRawLeaf(
            {
                level1Index: Round2ContributionStorage.calculateLevel1Index({
                    committeeId,
                    keyId,
                }),
                level2Index: Round2ContributionStorage.calculateLevel2Index(
                    Field(j)
                ),
            },
            round2Contribution
        );
    }
    for (let j = 0; j < N; j++) {
        dkgTrees.encryptionTree.updateRawLeaf(
            {
                level1Index: EncryptionStorage.calculateLevel1Index({
                    committeeId,
                    keyId,
                }),
                level2Index: EncryptionStorage.calculateLevel2Index(Field(j)),
            },
            {
                contributions: keys[0].round2Contributions,
                memberId: Field(j),
            }
        );
    }
    dkgTrees.keyStatusTree.updateRawLeaf(
        {
            level1Index: dkgTrees.keyStatusTree.calculateLevel1Index({
                committeeId,
                keyId,
            }),
        },
        Field(KeyStatus.ACTIVE)
    );
    dkgTrees.keyTree.updateRawLeaf(
        {
            level1Index: dkgTrees.keyTree.calculateLevel1Index({
                committeeId,
                keyId,
            }),
        },
        keys[0].key
    );

    //#endregion

    Provable.log('sharedAddressStorage: ', sharedAddressStorage.root);

    await fixAddressState(
        [
            projectZkApp,
            campaignZkApp,
            participationZkApp,
            fundingZkApp,
            treasuryManagerZkApp,
            fundingRequesterZkApp,
        ],
        _.feePayer,
        true,
        logger
    );
}

main();
