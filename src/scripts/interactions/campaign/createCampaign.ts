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
import axios from 'axios';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import { prepare } from '../prepare.js';

async function main() {
  const { cache, feePayer } = await prepare();

  const campaignId = 1;
  const keyId = 1;
  const projectId = 1;

  // Compile programs
  await compile(CreateCampaign, cache);
  await compile(CampaignContract, cache);

  const zkAppAddress =
    'B62qrqwur3JLNd95w8sKiGLxPEgF9cUs9bfwjytrAXwRxpxWhX78oq9';
  const zkContract = new CampaignContract(PublicKey.fromBase58(zkAppAddress));

  // Do this and state value of contract is fetched in Mina
  const rawState = (await fetchZkAppState(zkAppAddress)) || [];

  let input = new CreateCampaignInput({
    ipfsHash: IPFSHash.fromString(
      'QmcxSZtvz53WDFm6mw2ULqHXdmRA2pqa2SWA7yBDXBAy4V'
    ),
    committeeId: Field(campaignId),
    keyId: Field(keyId),
  });

  let tx = await Mina.transaction(
    {
      sender: feePayer.key.publicKey,
      fee: feePayer.fee,
      nonce: feePayer.nonce++,
    },
    () => {
      zkContract.createCampaign(input);
    }
  );
  await proveAndSend(tx, feePayer.key, 'campaign', 'createCampaign');
}

main()
  .then()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
