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
} from 'o1js';
import fs from 'fs/promises';
import { Config, Key } from './helper/config.js';
import {
  AddressStorage,
  EMPTY_ADDRESS_MT,
} from '../contracts/SharedStorage.js';
import { ZkAppEnum, Contract } from '../constants.js';
import { getProfiler } from './helper/profiler.js';
import { IPFSHash } from '@auxo-dev/auxo-libs';
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
} from '../contracts/ProjectStorage.js';
import { CampaignContract } from '../contracts/Campaign.js';
import {
  InfoStorage as CampaignInfoStorage,
  OwnerStorage,
  StatusStorage,
  ConfigStorage,
} from '../contracts/CampaignStorage.js';
import { FundingContract } from '../contracts/Funding.js';
import { ValueStorage } from '../contracts/FundingStorage.js';
import { ParticipationContract } from '../contracts/Participation.js';
import {
  InfoStorage as ParticipationInfoStorage,
  CounterStorage,
} from '../contracts/ParticipationStorage.js';
import { TreasuryContract } from '../contracts/Treasury.js';
import { ClaimedStorage } from '../contracts/TreasuryStorage.js';
import {
  ContractList,
  compile,
  deploy,
  fetchAllContract,
  proveAndSend,
  wait,
} from '../libs/utils.js';

const sendMoney = false;

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

  // let acc1: { privateKey: string; publicKey: string } = JSON.parse(
  //   await fs.readFile(configJson.deployAliases['acc1'].keyPath, 'utf8')
  // );
  // let acc2: { privateKey: string; publicKey: string } = JSON.parse(
  //   await fs.readFile(configJson.deployAliases['acc2'].keyPath, 'utf8')
  // );
  // let acc3: { privateKey: string; publicKey: string } = JSON.parse(
  //   await fs.readFile(configJson.deployAliases['acc3'].keyPath, 'utf8')
  // );

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

  // let members: Key[] = [
  //   {
  //     privateKey: PrivateKey.fromBase58(acc1.privateKey),
  //     publicKey: PublicKey.fromBase58(acc1.publicKey),
  //   },
  //   {
  //     privateKey: PrivateKey.fromBase58(acc2.privateKey),
  //     publicKey: PublicKey.fromBase58(acc2.publicKey),
  //   },
  // ];

  console.log('fetch all account');
  console.time('accounts');
  // const promises = members.map(async (member) => {
  //   const sender = await fetchAccount({ publicKey: member.publicKey });
  //   return Number(sender.account?.nonce) - 1;
  // });
  console.timeEnd('accounts');

  // const memberNonces: number[] = await Promise.all(promises);

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

  // Funding storage
  let valueStorage = new ValueStorage();
  let fundingAddressStorage = new AddressStorage(addressMerkleTree);

  // Participation storage
  let participationInfoStorage = new ParticipationInfoStorage();
  let counterStorage = new CounterStorage();
  let participationAddressStorage = new AddressStorage(addressMerkleTree);

  // Treasury storage
  let claimedStorage = new ClaimedStorage();
  let treasuryAddressStorage = new AddressStorage(addressMerkleTree);

  // if (sendMoney) {
  //   let tx = await Mina.transaction(
  //     { sender: feePayerKey.publicKey, fee, nonce: ++feePayerNonce },
  //     () => {
  //       AccountUpdate.fundNewAccount(feePayerKey.publicKey, members.length);
  //       let feePayerAccount = AccountUpdate.createSigned(feePayerKey.publicKey);
  //       for (let i = 0; i < members.length; i++) {
  //         feePayerAccount.send({
  //           to: members[i].publicKey,
  //           amount: 3 * 10 ** 9,
  //         }); // 3 Mina
  //       }
  //     }
  //   );
  //   await tx.sign([feePayerKey.privateKey]).send();
  //   await waitConfig(2 * 60 * 1000);
  // }

  await compile(CreateProject, cache, logMemory, profiler);
  // await compile(CreateCampaign, cache, logMemory, profiler);
  // await compile(CreateReduceProof, cache, logMemory, profiler);
  // await compile(CreateRollupProof, cache, logMemory, profiler);
  // await compile(JoinCampaign, cache, logMemory, profiler);
  // await compile(ClaimFund, cache, logMemory, profiler);

  await compile(ProjectContract, cache, logMemory, profiler);
  // await compile(CampaignContract, cache, logMemory, profiler);
  // await compile(FundingContract, cache, logMemory, profiler);
  // await compile(ParticipationContract, cache, logMemory, profiler);
  // await compile(TreasuryContract, cache, logMemory, profiler);

  let tx;

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

  // // Deploy FundingContract
  // await deploy(
  //   contracts[Contract.FUNDING],
  //   [['zkApps', fundingAddressStorage.addresses.getRoot()]],
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

  // // Deploy TreasuryContract
  // await deploy(
  //   contracts[Contract.TREASURY],
  //   [['zkApps', treasuryAddressStorage.addresses.getRoot()]],
  //   feePayerKey,
  //   fee,
  //   ++feePayerNonce
  // );

  // await wait();

  await fetchAllContract(contracts, [Contract.PROJECT]);

  console.log('Create projects...');
  let numProjects = 5;
  let projectContract = contracts[Contract.PROJECT].contract as ProjectContract;
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
      ipfsHash: IPFSHash.fromString(
        'QmNQLoDczHM3HXKodoYQnRszgd4JR4ZxzEKYe534eEBCc2'
      ),
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
    await proveAndSend(tx, feePayerKey, 'ProjectContract', 'createProject');

    projectActions.push(
      new ProjectAction({
        projectId: Field(-1),
        members: createProjectInput.members,
        ipfsHash: createProjectInput.ipfsHash,
        payeeAccount: createProjectInput.payeeAccount,
      })
    );

    await wait();
  }

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
      payeeStorage.getLevel1Witness(payeeStorage.calculateLevel1Index(Field(i)))
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

  tx = await Mina.transaction(feePayerKey.publicKey, () => {
    projectContract.rollup(createProjectProof);
  });
  await proveAndSend(tx, feePayerKey, 'ProjectContract', 'rollup');
  await wait();

  console.log('done all');
  console.timeEnd('runTime');
}

main();
