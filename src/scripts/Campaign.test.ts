import {
  Field,
  Reducer,
  Mina,
  PrivateKey,
  PublicKey,
  Cache,
  SmartContract,
} from 'o1js';
import fs from 'fs';
import { getProfiler } from './helper/profiler.js';
import {
  CampaignAction,
  CampaignContract,
  CreateCampaign,
  CreateCampaignInput,
} from '../contracts/Campaign.js';
import {
  InfoStorage as CampaignInfoStorage,
  ConfigStorage,
  OwnerStorage,
  StatusEnum,
  StatusStorage,
} from '../contracts/CampaignStorage.js';
import {
  AddressStorage,
  EMPTY_ADDRESS_MT,
} from '../contracts/SharedStorage.js';
import { ContractList, compile, deploy, proveAndSend } from '../libs/utils.js';
import { Config, Key } from './helper/config.js';
import { Contract, ZkAppEnum } from '../constants.js';
import { ProjectContract } from '../contracts/Project.js';
import { FundingContract } from '../contracts/Funding.js';
import { ParticipationContract } from '../contracts/Participation.js';
import { TreasuryContract } from '../contracts/Treasury.js';
import { IPFSHash } from '@auxo-dev/auxo-libs';

describe('Campaign', () => {
  const doProofs = false;
  const profiling = false;
  const logMemory = false;
  const cache = Cache.FileSystem('./caches');
  const CampaignProfiler = getProfiler('Benchmark Campaign');
  const profiler = profiling ? CampaignProfiler : undefined;
  let Local = Mina.LocalBlockchain({ proofsEnabled: doProofs });
  Mina.setActiveInstance(Local);

  let accounts: Key[] = Local.testAccounts.slice(1, 5);
  let feePayerKey: Key = accounts[0];
  let contracts: ContractList;
  let actions: CampaignAction[];

  let addressMerkleTree = EMPTY_ADDRESS_MT();

  let zkAppAddressess = {};

  // Campaign storage
  let campaignInfoStorage = new CampaignInfoStorage();
  let ownerStorage = new OwnerStorage();
  let statusStorage = new StatusStorage();
  let configStorage = new ConfigStorage();
  let campaignAddressStorage = new AddressStorage(addressMerkleTree);

  beforeAll(async () => {
    let configJson: Config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

    await Promise.all(
      Object.keys(Contract)
        .filter((item) => isNaN(Number(item)))
        .map(async (e) => {
          let config = configJson.deployAliases[e.toLowerCase()];
          // console.log(config);
          let keyBase58: { privateKey: string; publicKey: string } = JSON.parse(
            fs.readFileSync(config.keyPath, 'utf8')
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
  });

  // beforeEach(() => {});

  it('should compile programs and contracts', async () => {
    await compile(CreateCampaign, cache, logMemory, profiler);
    if (doProofs) {
      await compile(CampaignContract, cache, logMemory, profiler);
    } else {
      console.log('CampaignContract.analyzeMethods...');
      CampaignContract.analyzeMethods();
    }
  });

  it('should deploy contracts', async () => {
    await deploy(contracts[Contract.CAMPAIGN], [], feePayerKey);
  });

  it('should create a campaign', async () => {
    let createCampaignInput = new CreateCampaignInput({
      ipfsHash: IPFSHash.fromString('test'),
      committeeId: Field(0),
      keyId: Field(0),
    });

    let campaignContract = contracts[Contract.CAMPAIGN]
      .contract as CampaignContract;

    let tx = await Mina.transaction(feePayerKey.publicKey, () => {
      campaignContract.createCampaign(createCampaignInput);
    });

    await proveAndSend(tx, feePayerKey, 'ProjectContract', 'createProject');

    actions.push(
      new CampaignAction({
        campaignId: Field(-1),
        ipfsHash: createCampaignInput.ipfsHash,
        owner: feePayerKey.publicKey,
        campaignStatus: Field(StatusEnum.APPLICATION),
        committeeId: createCampaignInput.committeeId,
        keyId: createCampaignInput.keyId,
      })
    );
  });

  it('should update campaigns', async () => {
    let campaignContract = contracts[Contract.CAMPAIGN]
      .contract as CampaignContract;

    let campaignId = Field(0);

    let campaignProof = await CreateCampaign.firstStep(
      campaignContract.ownerTreeRoot.get(),
      campaignContract.infoTreeRoot.get(),
      campaignContract.statusTreeRoot.get(),
      campaignContract.configTreeRoot.get(),
      campaignContract.nextCampaignId.get(),
      campaignContract.lastRolledUpActionState.get()
    );

    campaignProof = await CreateCampaign.createCampaign(
      campaignProof,
      actions[0],
      ownerStorage.getWitness(ownerStorage.calculateLevel1Index(campaignId)),
      campaignInfoStorage.getWitness(
        campaignInfoStorage.calculateLevel1Index(campaignId)
      ),
      statusStorage.getWitness(statusStorage.calculateLevel1Index(campaignId)),
      // ??
      configStorage.getLevel1Witness(
        configStorage.calculateLevel1Index(Field(0))
      )
    );
  });
});
