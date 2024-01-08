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
} from 'o1js';
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
import { ValueStorage } from '../contracts/FundingStorage.js';
import {
  ParticipationContract,
  JoinCampaign,
  ParticipationAction,
  JoinCampaignInput,
} from '../contracts/Participation.js';
import mockParticipationIpfs from './mock/participations.js';
import {
  InfoStorage as ParticipationInfoStorage,
  CounterStorage,
  IndexStorage,
  EMPTY_LEVEL_1_TREE,
  EMPTY_LEVEL_1_COMBINED_TREE,
} from '../contracts/ParticipationStorage.js';
import {
  TreasuryContract,
  ClaimFund,
  TreasuryAction,
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

// const isCompile = false;

const isDeploy = false;
const isProject = false;
const isCampaign = false;
const isParticipation = false;
const isFunding = true;
const isTreasury = false;

async function main() {
  console.time('runTime');
  const doProofs = false;
  const logMemory = true;
  const cache = Cache.FileSystem('./caches');
  const profiling = false;
  const PlatformProfiler = getProfiler('Benchmark Platform');
  const profiler = profiling ? PlatformProfiler : undefined;

  let feePayerKey: Key;
  let contracts: ContractList = {};

  let configJson: Config = JSON.parse(await fs.readFile('config.json', 'utf8'));

  // Testworld + Berkeley
  feePayerKey = {
    privateKey: PrivateKey.fromBase58(
      'EKEosAyM6Y6TnPVwUaWhE7iUS3v6mwVW7uDnWes7FkYVwQoUwyMR'
    ),
    publicKey: PublicKey.fromBase58(
      'B62qmtfTkHLzmvoKYcTLPeqvuVatnB6wtnXsP6jrEi6i2eUEjcxWauH'
    ),
  };

  console.log('Deployer Public Key: ', feePayerKey.publicKey.toBase58());

  const fee = 0.101 * 1e9; // in nanomina (1 billion = 1.0 mina)

  const MINAURL = 'https://proxy.berkeley.minaexplorer.com/graphql';
  const ARCHIVEURL = 'https://archive.berkeley.minaexplorer.com';

  const network = Mina.Network({
    mina: MINAURL,
    archive: ARCHIVEURL,
  });
  Mina.setActiveInstance(network);

  let feePayerNonce;
  let dk = false;

  do {
    let sender = await fetchAccount({ publicKey: feePayerKey.publicKey });
    feePayerNonce = Number(sender.account?.nonce) - 1;
    if (feePayerNonce) dk = true;
    console.log('fetch nonce');
    await wait(1000); // 1s
  } while (!dk);

  console.log('Nonce: ', feePayerNonce);

  let addressMerkleTree = EMPTY_ADDRESS_MT();

  await Promise.all(
    Object.keys(Contract)
      .filter((item) => isNaN(Number(item)))
      .map(async (e) => {
        let config = configJson.deployAliases[e.toLowerCase()];
        // console.log(config);
        let keyBase58: { privateKey: string; publicKey: string } = JSON.parse(
          await fs.readFile(config.keyPath, 'utf8')
        );
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
            default:
              return new SmartContract(key.publicKey);
          }
        })();

        addressMerkleTree.setLeaf(
          AddressStorage.calculateIndex(ZkAppEnum[e]).toBigInt(),
          AddressStorage.calculateLeaf(key.publicKey)
        );

        contracts[e.toLowerCase()] = {
          name: e.toLowerCase(),
          key: key,
          contract: contract,
          actionStates: [Reducer.initialActionState],
        };
      })
  );
  // Project storage
  let memberStorage = new MemberStorage();
  let projectInfoStorage = new ProjectInfoStorage();
  let payeeStorage = new PayeeStorage();
  let projectActions: ProjectAction[] = [];

  // Campaign storage
  let campaignInfoStorage = new CampaignInfoStorage();
  let ownerStorage = new OwnerStorage();
  let statusStorage = new StatusStorage();
  let configStorage = new ConfigStorage();
  let campaignAddressStorage = new AddressStorage(addressMerkleTree);
  let campaignActions: CampaignAction[] = [];

  // Participation storage
  let participationInfoStorage = new ParticipationInfoStorage();
  let counterStorage = new CounterStorage();
  let indexStorage = new IndexStorage();
  let participationAddressStorage = new AddressStorage(addressMerkleTree);
  let participationAction: ParticipationAction[] = [];

  // Funding storage
  let fundingReduceStorage = new ReduceStorage();
  let sumRStorage = new ValueStorage();
  let sumMStorage = new ValueStorage();
  let fundingAddressStorage = new AddressStorage(addressMerkleTree);
  let fundingAction: FundingAction[] = [];

  // Treasury storage
  let claimedStorage = new ClaimedStorage();
  let treasuryAddressStorage = new AddressStorage(addressMerkleTree);
  let treasuryAction: TreasuryAction[] = [];

  if (isProject) {
    await compile(CreateProject, cache, logMemory, profiler);
    await compile(ProjectContract, cache, logMemory, profiler);
  }

  if (isCampaign) {
    await compile(CreateCampaign, cache, logMemory, profiler);
    await compile(CampaignContract, cache, logMemory, profiler);
  }

  if (isParticipation) {
    await compile(JoinCampaign, cache, logMemory, profiler);
    await compile(ParticipationContract, cache, logMemory, profiler);
  }

  if (isFunding) {
    await compile(CreateReduceProof, cache, logMemory, profiler);
    await compile(CreateRollupProof, cache, logMemory, profiler);
    await compile(FundingContract, cache, logMemory, profiler);
  }

  if (isTreasury) {
    await compile(ClaimFund, cache, logMemory, profiler);
    await compile(TreasuryContract, cache, logMemory, profiler);
  }

  let tx;

  if (isDeploy) {
    // // Deploy ProjectContract
    // await deploy(
    //   contracts[Contract.PROJECT],
    //   [],
    //   feePayerKey,
    //   fee,
    //   ++feePayerNonce
    // );

    // // Deploy CampaignContract
    // await deploy(
    //   contracts[Contract.CAMPAIGN],
    //   [['zkApps', campaignAddressStorage.addresses.getRoot()]],
    //   feePayerKey,
    //   fee,
    //   ++feePayerNonce
    // );

    // // Deploy ParticipationContract
    // await deploy(
    //   contracts[Contract.PARTICIPATION],
    //   [['zkApps', participationAddressStorage.addresses.getRoot()]],
    //   feePayerKey,
    //   fee,
    //   ++feePayerNonce
    // );

    // Deploy FundingContract
    // await deploy(
    //   contracts[Contract.FUNDING],
    //   [['zkApps', fundingAddressStorage.addresses.getRoot()]],
    //   feePayerKey,
    //   fee,
    //   ++feePayerNonce
    // );

    // tx = await Mina.transaction(
    //   { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
    //   () => {
    //     let feePayerAccount = AccountUpdate.createSigned(feePayerKey.publicKey);
    //     feePayerAccount.send({
    //       to: contracts[Contract.FUNDING].contract,
    //       amount: 3 * 10 ** 9,
    //     }); // 3 Mina
    //   }
    // );
    // await tx.sign([feePayerKey.privateKey]).send();

    // Deploy TreasuryContract
    await deploy(
      contracts[Contract.TREASURY],
      [['zkApps', treasuryAddressStorage.addresses.getRoot()]],
      feePayerKey,
      fee,
      ++feePayerNonce
    );

    // if (isProject) await wait();
    await wait();
  }

  if (isProject) {
    await fetchAllContract(contracts, [Contract.PROJECT]);
    console.log('Create projects...');
    let numProjects = 5;
    let projectContract = contracts[Contract.PROJECT]
      .contract as ProjectContract;
    let arrayPublicKey = [
      'B62qjvrida5Kr4rj7f4gDZyG77TdFMp2ntZ9uf5Xzb7iPodykUgwYqm',
      'B62qnhBkHqUeUTmYiAvvGdywce7j5PeTdU6t6mi7UAL8emD3mDPtQW2',
      'B62qnk1is4cK94PCX1QTwPM1SxfeCF9CcN6Nr7Eww3JLDgvxfWdhR5S',
      'B62qmtfTkHLzmvoKYcTLPeqvuVatnB6wtnXsP6jrEi6i2eUEjcxWauH',
    ].map((e) => PublicKey.fromBase58(e));
    let memberArray = new MemberArray(arrayPublicKey);

    for (let i = 0; i < numProjects; i++) {
      let createProjectInput = new CreateProjectInput({
        members: memberArray,
        ipfsHash: IPFSHash.fromString(mockProjectIpfs[0]),
        payeeAccount: PublicKey.fromBase58(
          'B62qnk1is4cK94PCX1QTwPM1SxfeCF9CcN6Nr7Eww3JLDgvxfWdhR5S'
        ),
      });

      tx = await Mina.transaction(
        { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
        () => {
          projectContract.createProject(createProjectInput);
        }
      );
      await proveAndSend(tx, [feePayerKey], 'ProjectContract', 'createProject');

      projectActions.push(
        new ProjectAction({
          projectId: Field(-1),
          members: createProjectInput.members,
          ipfsHash: createProjectInput.ipfsHash,
          payeeAccount: createProjectInput.payeeAccount,
        })
      );
    }

    await wait();
    await fetchAllContract(contracts, [Contract.PROJECT]);

    console.log('Reduce projects...');

    let createProjectProof = await CreateProject.firstStep(
      projectContract.nextProjectId.get(),
      projectContract.memberTreeRoot.get(),
      projectContract.projectInfoTreeRoot.get(),
      projectContract.payeeTreeRoot.get(),
      projectContract.lastRolledUpActionState.get()
    );

    let tree1 = EMPTY_LEVEL_2_TREE();
    for (let i = 0; i < Number(memberArray.length); i++) {
      tree1.setLeaf(BigInt(i), MemberArray.hash(memberArray.get(Field(i))));
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
        projectInfoStorage.calculateLeaf(projectActions[i].ipfsHash),
        Field(i)
      );
      payeeStorage.updateLeaf(
        payeeStorage.calculateLeaf(projectActions[i].payeeAccount),
        Field(i)
      );
    }

    tx = await Mina.transaction(
      { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
      () => {
        projectContract.rollup(createProjectProof);
      }
    );
    await proveAndSend(tx, [feePayerKey], 'ProjectContract', 'rollup');

    if (isCampaign) await wait();
  }

  if (isCampaign) {
    await fetchAllContract(contracts, [Contract.CAMPAIGN]);
    console.log('Create campaign...');
    let numCampaign = 3;
    let campaignContract = contracts[Contract.CAMPAIGN]
      .contract as CampaignContract;

    for (let i = 0; i < numCampaign; i++) {
      let createCampaignInput = new CreateCampaignInput({
        ipfsHash: IPFSHash.fromString(mockCampaignIpfs[0]),
        committeeId: Field(i + 1),
        keyId: Field(i + 1),
      });
      tx = await Mina.transaction(
        { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
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

    await wait();
    await fetchAllContract(contracts, [Contract.CAMPAIGN]);

    console.log('Reduce campaign...');

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
      { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
      () => {
        campaignContract.rollup(createCampaignProof);
      }
    );
    await proveAndSend(tx, [feePayerKey], Contract.CAMPAIGN, 'rollup');

    if (isParticipation) await wait();
  }

  if (isParticipation) {
    Provable.log('EMPTY_LEVEL_1_TREE: ', EMPTY_LEVEL_1_TREE().getRoot());
    Provable.log(
      'EMPTY_LEVEL_1_COMBINED_TREE: ',
      EMPTY_LEVEL_1_COMBINED_TREE().getRoot()
    );

    await fetchAllContract(contracts, [Contract.PARTICIPATION]);
    console.log('Join campaign...');
    let numCampaign = 2;
    let participationContract = contracts[Contract.PARTICIPATION]
      .contract as ParticipationContract;

    Provable.log('Onchain: ', participationContract.indexTreeRoot.get());

    let joinCampaignInput = [
      new JoinCampaignInput({
        campaignId: Field(1),
        projectId: Field(1),
        participationInfo: IPFSHash.fromString(mockParticipationIpfs[0]),
        indexWitness: indexStorage.getWitness(
          indexStorage.calculateLevel1Index({
            campaignId: Field(1),
            projectId: Field(1),
          })
        ),
        memberLv1Witness: memberStorage.getLevel1Witness(Field(1)),
        memberLv2Witness: new Level2Witness(
          EMPTY_LEVEL_2_TREE().getWitness(0n)
        ), // temp value since contract hasn't check this
        // memberLv2Witness: memberStorage.getLevel2Witness(Field(1), Field(0)), // Field 0 = owner
        projectRef: getZkAppRef(
          participationAddressStorage.addresses,
          ZkAppEnum.PROJECT,
          contracts[Contract.PROJECT].contract.address
        ),
      }),
      new JoinCampaignInput({
        campaignId: Field(1),
        projectId: Field(2),
        participationInfo: IPFSHash.fromString(mockParticipationIpfs[0]),
        indexWitness: indexStorage.getWitness(
          indexStorage.calculateLevel1Index({
            campaignId: Field(1),
            projectId: Field(2),
          })
        ),
        memberLv1Witness: memberStorage.getLevel1Witness(Field(2)),
        memberLv2Witness: new Level2Witness(
          EMPTY_LEVEL_2_TREE().getWitness(0n)
        ), // fake value since contract hasn't check this
        // memberLv2Witness: memberStorage.getLevel2Witness(Field(2), Field(0)), // Field 0 = owner
        projectRef: getZkAppRef(
          participationAddressStorage.addresses,
          ZkAppEnum.PROJECT,
          contracts[Contract.PROJECT].contract.address
        ),
      }),
    ];

    for (let i = 0; i < numCampaign; i++) {
      tx = await Mina.transaction(
        { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
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

    await wait();

    console.log('Reduce participation...');

    let joinCampaignProof = await JoinCampaign.firstStep(
      participationContract.indexTreeRoot.get(),
      participationContract.infoTreeRoot.get(),
      participationContract.counterTreeRoot.get(),
      participationContract.lastRolledUpActionState.get()
    );

    for (let i = 0; i < numCampaign; i++) {
      console.log('Step', i);

      let witness = indexStorage.getLevel1Witness(
        indexStorage.calculateLevel1Index({
          campaignId: participationAction[i].campaignId,
          projectId: participationAction[i].projectId,
        })
      );

      let rootFormWitness = witness.calculateRoot(Field(i + 1));
      let rootFormWitnessBEF = witness.calculateRoot(Field(i));

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
        Field(i), // current couter of each campaign is 0
        counterStorage.getLevel1Witness(
          counterStorage.calculateLevel1Index(participationAction[i].campaignId)
        )
      );

      // update storage:
      indexStorage.updateLeaf(
        indexStorage.calculateLeaf(Field(i + 1)), // index start from 1
        indexStorage.calculateLevel1Index({
          campaignId: participationAction[i].campaignId,
          projectId: participationAction[i].projectId,
        })
      );

      Provable.log('index off aft: ', indexStorage.level1.getRoot());

      participationInfoStorage.updateLeaf(
        participationInfoStorage.calculateLeaf(
          participationAction[i].participationInfo
        ),
        participationInfoStorage.calculateLevel1Index({
          campaignId: participationAction[i].campaignId,
          projectId: participationAction[i].projectId,
        })
      );
      counterStorage.updateLeaf(
        counterStorage.calculateLeaf(Field(i + 1)),
        counterStorage.calculateLevel1Index(participationAction[i].campaignId)
      );
    }

    tx = await Mina.transaction(
      { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
      () => {
        participationContract.rollup(joinCampaignProof);
      }
    );
    await proveAndSend(tx, [feePayerKey], Contract.CAMPAIGN, 'rollup');

    if (isFunding) await wait();
  }

  if (isFunding) {
    await fetchAllContract(contracts, [Contract.FUNDING]);

    let acc1: { privateKey: string; publicKey: string } = JSON.parse(
      await fs.readFile('keys/acc1.json', 'utf8')
    );
    let acc2: { privateKey: string; publicKey: string } = JSON.parse(
      await fs.readFile('keys/acc1.json', 'utf8')
    );

    let investors: Key[] = [
      {
        privateKey: PrivateKey.fromBase58(acc1.privateKey),
        publicKey: PublicKey.fromBase58(acc1.publicKey),
      },
      {
        privateKey: PrivateKey.fromBase58(acc2.privateKey),
        publicKey: PublicKey.fromBase58(acc2.publicKey),
      },
    ];

    // total fund 0.02 = 2e7
    let secretVectors: CustomScalarArray[] = [
      new CustomScalarArray([
        CustomScalar.fromScalar(Scalar.from(1e7)),
        CustomScalar.fromScalar(Scalar.from(10n)),
        CustomScalar.fromScalar(Scalar.from(1e7)),
        CustomScalar.fromScalar(Scalar.from(10n)),
      ]),
      new CustomScalarArray([
        CustomScalar.fromScalar(Scalar.from(10n)),
        CustomScalar.fromScalar(Scalar.from(10n)),
        CustomScalar.fromScalar(Scalar.from(1e7)),
        CustomScalar.fromScalar(Scalar.from(1e7)),
      ]),
    ];

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

    console.log('Funding...');

    let fundingContract = contracts[Contract.FUNDING]
      .contract as FundingContract;

    let fundingInput = [
      new FundingInput({
        campaignId: Field(1),
        committeePublicKey: contracts[Contract.COMMITTEE].key.publicKey,
        secretVector: secretVectors[0],
        random: randomsVectors[0],
        treasuryContract: getZkAppRef(
          fundingAddressStorage.addresses,
          ZkAppEnum.TREASURY,
          contracts[Contract.TREASURY].contract.address
        ),
      }),
      new FundingInput({
        campaignId: Field(1),
        committeePublicKey: contracts[Contract.COMMITTEE].key.publicKey,
        secretVector: secretVectors[1],
        random: randomsVectors[1],
        treasuryContract: getZkAppRef(
          fundingAddressStorage.addresses,
          ZkAppEnum.TREASURY,
          contracts[Contract.TREASURY].contract.address
        ),
      }),
    ];

    let result: {
      R: ZkApp.Request.RequestVector;
      M: ZkApp.Request.RequestVector;
    };

    for (let i = 0; i < investors.length; i++) {
      let balanceBefore = Number(Account(investors[i].publicKey).balance.get());
      tx = await Mina.transaction(investors[i].publicKey, () => {
        result = fundingContract.fund(fundingInput[i]);
      });
      await proveAndSend(tx, [investors[i]], Contract.FUNDING, 'fund');
      let balanceAfter = Number(Account(investors[i].publicKey).balance.get());
      console.log('Balance change: ', balanceBefore - balanceAfter);

      let { R, M } = result!;

      fundingAction.push(
        new FundingAction({
          campaignId: fundingInput[i].campaignId,
          R,
          M,
        })
      );
    }

    await wait();
    await fetchAllContract(contracts, [Contract.FUNDING]);

    let lastActionState = fundingContract.actionState.get();
    let fundingActionStates = contracts[Contract.FUNDING].actionStates;
    let index = fundingActionStates.findIndex((obj) => obj == lastActionState);

    console.log('Reduce funding...');

    let reduceFundingProof = await CreateReduceProof.firstStep(
      fundingContract.actionState.get(),
      fundingContract.actionStatus.get()
    );

    for (let i = 0; i < investors.length; i++) {
      console.log('Step', i);
      reduceFundingProof = await CreateReduceProof.nextStep(
        reduceFundingProof,
        fundingAction[i],
        fundingReduceStorage.getWitness(fundingActionStates[index + 1 + i])
      );

      // update storage:
      fundingReduceStorage.updateLeaf(
        fundingReduceStorage.calculateIndex(fundingActionStates[index + 1 + i]),
        fundingReduceStorage.calculateLeaf(ActionStatus.REDUCED)
      );
    }

    tx = await Mina.transaction(
      { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
      () => {
        fundingContract.reduce(reduceFundingProof);
      }
    );
    await proveAndSend(tx, [feePayerKey], Contract.FUNDING, 'reduce');

    await wait();
    await fetchAllContract(contracts, [Contract.FUNDING]);

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
        fundingReduceStorage.getWitness(fundingActionStates[index + 1 + i])
      );

      // update storage:
      fundingReduceStorage.updateLeaf(
        fundingReduceStorage.calculateIndex(fundingActionStates[index + 1 + i]),
        fundingReduceStorage.calculateLeaf(ActionStatus.ROLL_UPED)
      );
    }

    tx = await Mina.transaction(
      { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
      () => {
        fundingContract.rollupRequest(
          rollUpFundingProof,
          Field(2),
          Field(2),
          sumRStorage.getLevel1Witness(
            sumRStorage.calculateLevel1Index(fundingAction[0].campaignId)
          ),
          sumMStorage.getLevel1Witness(
            sumMStorage.calculateLevel1Index(fundingAction[0].campaignId)
          ),
          getZkAppRef(
            fundingAddressStorage.addresses,
            ZkAppEnum.REQUEST,
            contracts[Contract.REQUEST].contract.address
          )
        );
      }
    );
    await proveAndSend(tx, [feePayerKey], Contract.FUNDING, '');

    if (isTreasury) await wait();
  }

  if (isTreasury) {
  }

  console.log('done all');
  console.timeEnd('runTime');
}

main();
