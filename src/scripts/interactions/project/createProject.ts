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
    ProjectContract,
    ProjectAction,
    CreateProject,
    CreateProjectInput,
    ProjectProof,
} from '../../../contracts/Project.js';
import {
    MemberStorage,
    InfoStorage,
    MemberArray,
} from '../../../contracts/ProjectStorage.js';
import { IPFSHash } from '@auxo-dev/auxo-libs';
import { prepare } from '../prepare.js';

async function main() {
    const { cache, feePayer } = await prepare();

    // Compile programs
    await compile(CreateProject, cache);
    await compile(ProjectContract, cache);

    const projectAddress = process.env.BERKELEY_PROJECT_ADDRESS as string;
    console.log('Project address: ', projectAddress);
    const projectContract = new ProjectContract(
        PublicKey.fromBase58(projectAddress)
    );

    // Do this and state value of contract is fetched in Mina
    const rawState = (await fetchZkAppState(projectAddress)) || [];

    let arrayPublicKey = [
        'B62qjpYQhA6Nsg2xo1FWSmy6yXkfL3S1oNxZ21awcFCKiRH6n9fWqPJ',
        'B62qnhBkHqUeUTmYiAvvGdywce7j5PeTdU6t6mi7UAL8emD3mDPtQW2',
        'B62qnk1is4cK94PCX1QTwPM1SxfeCF9CcN6Nr7Eww3JLDgvxfWdhR5S',
        'B62qmtfTkHLzmvoKYcTLPeqvuVatnB6wtnXsP6jrEi6i2eUEjcxWauH',
    ].map((e) => PublicKey.fromBase58(e));
    let memberArray = new MemberArray(arrayPublicKey);

    let input = new CreateProjectInput({
        members: memberArray,
        ipfsHash: IPFSHash.fromString(
            'QmNQLoDczHM3HXKodoYQnRszgd4JR4ZxzEKYe534eEBCc2'
        ),
        payeeAccount: PublicKey.fromBase58(
            'B62qjpYQhA6Nsg2xo1FWSmy6yXkfL3S1oNxZ21awcFCKiRH6n9fWqPJ'
        ),
    });

    let tx = await Mina.transaction(
        {
            sender: feePayer.key.publicKey,
            fee: feePayer.fee,
            nonce: feePayer.nonce++,
        },
        () => {
            projectContract.createProject(input);
        }
    );
    await proveAndSend(tx, feePayer.key, 'projectContract', 'createProject');
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
