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

import { compile } from '../../helper/compile.js';

import {
    fetchActions,
    fetchZkAppState,
} from '@auxo-dev/auxo-libs/build/types/src/utils/network.js';

import {
    ProjectContract,
    ProjectAction,
    RollupProject,
    RollupProjectOutput,
} from '../../../contracts/Project.js';
import { MemberArray } from '../../../storages/ProjectStorage.js';
import { Network } from '../../helper/config.js';
import { IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import { prepare } from '../../helper/prepare.js';

async function main() {
    let _ = await prepare(
        './caches',
        { type: Network.Lightnet, doProofs: true },
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
                'treasuryManager',
            ],
        }
    );

    const logger: Utils.Logger = {
        info: true,
        error: true,
        memoryUsage: false,
    };

    // Compile programs
    await compile(_.cache, [ProjectContract, RollupProject], undefined, {
        error: true,
        info: true,
        memoryUsage: true,
    });

    const projectAddress = process.env.BERKELEY_PROJECT_ADDRESS as string;

    console.log('Project address: ', projectAddress);

    const projectContract = new ProjectContract(
        PublicKey.fromBase58(projectAddress)
    );

    // Do this and state value of contract is fetched in Mina
    const rawState =
        (await fetchZkAppState(PublicKey.fromBase58(projectAddress))) || [];

    let arrayPublicKey = [
        'B62qjpYQhA6Nsg2xo1FWSmy6yXkfL3S1oNxZ21awcFCKiRH6n9fWqPJ',
        'B62qnhBkHqUeUTmYiAvvGdywce7j5PeTdU6t6mi7UAL8emD3mDPtQW2',
        'B62qnk1is4cK94PCX1QTwPM1SxfeCF9CcN6Nr7Eww3JLDgvxfWdhR5S',
        'B62qmtfTkHLzmvoKYcTLPeqvuVatnB6wtnXsP6jrEi6i2eUEjcxWauH',
    ].map((e) => PublicKey.fromBase58(e));

    let memberArray = new MemberArray(arrayPublicKey);

    let tx = await Mina.transaction(
        {
            sender: _.feePayer.sender.publicKey,
            fee: _.feePayer.fee,
            nonce: _.feePayer.nonce!++,
        },
        async () => {
            projectContract.createProject(
                memberArray,
                IpfsHash.fromString(
                    'QmNQLoDczHM3HXKodoYQnRszgd4JR4ZxzEKYe534eEBCc2'
                ),
                PublicKey.fromBase58(
                    'B62qjpYQhA6Nsg2xo1FWSmy6yXkfL3S1oNxZ21awcFCKiRH6n9fWqPJ'
                )
            );
        }
    );

    await Utils.proveAndSendTx(
        ProjectContract.name,
        'createProject',
        async () => {
            projectContract.createProject(
                memberArray,
                IpfsHash.fromString(
                    'QmNQLoDczHM3HXKodoYQnRszgd4JR4ZxzEKYe534eEBCc2'
                ),
                PublicKey.fromBase58(
                    'B62qjpYQhA6Nsg2xo1FWSmy6yXkfL3S1oNxZ21awcFCKiRH6n9fWqPJ'
                )
            );
        },
        _.feePayer,
        true,
        undefined,
        logger
    );
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
