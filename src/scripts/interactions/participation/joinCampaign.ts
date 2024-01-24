import fs from 'fs';
import {
  Cache,
  Field,
  Mina,
  PrivateKey,
  Provable,
  PublicKey,
  Reducer,
  fetchAccount,
} from 'o1js';
import { Config, JSONKey, Key } from '../../helper/config.js';
import {
  ContractList,
  compile,
  wait,
  proveAndSend,
} from '../../helper/deploy.js';
import { fetchActions, fetchZkAppState } from '../../helper/deploy.js';
import {
  CampaignContract,
  CreateCampaign,
  CreateCampaignInput,
  CampaignAction,
} from '../../../contracts/Campaign.js';
import {
  InfoStorage as CampaignInfoStorage,
  OwnerStorage,
  StatusStorage,
  ConfigStorage,
  StatusEnum,
} from '../../../contracts/CampaignStorage.js';
import {
  ParticipationContract,
  JoinCampaign,
  ParticipationAction,
  JoinCampaignInput,
} from '../../../contracts/Participation.js';
import {
  InfoStorage as ParticipationInfoStorage,
  CounterStorage,
  IndexStorage,
  EMPTY_LEVEL_1_TREE,
  EMPTY_LEVEL_1_COMBINED_TREE,
} from '../../../contracts/ParticipationStorage.js';
import {
  MemberStorage,
  Level2Witness,
  EMPTY_LEVEL_2_TREE,
  MemberArray,
} from '../../../contracts/ProjectStorage.js';
import axios from 'axios';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import { prepare } from '../prepare.js';
import {
  AddressStorage,
  getZkAppRef,
} from '../../../contracts/SharedStorage.js';
import { ZkAppEnum } from '../../../constants.js';

async function main() {
  const { cache, feePayer, addressMerkleTree } = await prepare();

  const projectId = 1;
  const campaignId = 4;

  // Compile programs
  await compile(JoinCampaign, cache);
  await compile(ParticipationContract, cache);

  const projectAddress = process.env.BERKELEY_PROJECT_ADDRESS as string;
  const participationAddress = process.env
    .BERKELEY_PARTICIPATION_ADDRESS as string;
  const zkContract = new ParticipationContract(
    PublicKey.fromBase58(participationAddress)
  );

  // Do this and state value of contract is fetched in Mina
  await fetchZkAppState(projectAddress);
  await fetchZkAppState(participationAddress);

  // Project storage
  let memberStorage = new MemberStorage();
  // Participation storage
  let indexStorage = new IndexStorage();
  let participationAddressStorage = new AddressStorage(addressMerkleTree);
  console.log('Root: ', addressMerkleTree.getRoot());

  // Fetch storage trees
  const projectsInCampaign = (
    await axios.get(`https://api.auxo.fund/v0/campaigns/${campaignId}/projects`)
  ).data;

  const projects = (await axios.get('https://api.auxo.fund/v0/projects/')).data;

  // Build storage
  projects.map((project: any) => {
    if (Boolean(project.active)) {
      let level2Tree = EMPTY_LEVEL_2_TREE();
      for (let i = 0; i < project.members.length; i++) {
        level2Tree.setLeaf(
          BigInt(i),
          MemberArray.hash(PublicKey.fromBase58(project.members[i]))
        );
      }
      memberStorage.updateInternal(Field(project.projectId), level2Tree);
    }
  });

  for (let i = 0; i < projectsInCampaign.length; i++) {
    indexStorage.updateLeaf(
      indexStorage.calculateLeaf(Field(i + 1)),
      Field(projectsInCampaign[i].projectId)
    );
  }

  let input = new JoinCampaignInput({
    campaignId: Field(campaignId),
    projectId: Field(projectId),
    participationInfo: IPFSHash.fromString(
      '5be6550968b09cb42560c6bd73cb513b8a77293933aca74246a30b7f6bb30f9a'
    ),
    indexWitness: indexStorage.getWitness(
      indexStorage.calculateLevel1Index({
        campaignId: Field(campaignId),
        projectId: Field(projectId),
      })
    ),
    memberLv1Witness: memberStorage.getLevel1Witness(Field(projectId)), // contract hasn't check this
    memberLv2Witness: memberStorage.getLevel2Witness(
      Field(projectId),
      Field(0)
    ),
    projectRef: getZkAppRef(
      participationAddressStorage.addresses,
      ZkAppEnum.PROJECT,
      PublicKey.fromBase58(projectAddress)
    ),
  });

  let tx = await Mina.transaction(
    {
      sender: feePayer.key.publicKey,
      fee: feePayer.fee,
      nonce: feePayer.nonce++,
    },
    () => {
      zkContract.joinCampaign(input);
    }
  );
  await proveAndSend(tx, feePayer.key, 'participation', 'joinCampaign');
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
