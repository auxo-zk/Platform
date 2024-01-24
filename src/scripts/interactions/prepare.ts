import 'dotenv/config.js';
import fs from 'fs';
import { Cache, Mina, PrivateKey, PublicKey, fetchAccount, Field } from 'o1js';
import { Config, JSONKey, Key } from '../helper/config.js';
import { wait } from '../helper/deploy.js';
import { Contract, ZkAppEnum } from '../../constants.js';
import {
    EMPTY_ADDRESS_MT,
    AddressStorage,
} from '../../contracts/SharedStorage.js';

export async function prepare() {
    // Cache folder
    const cache = Cache.FileSystem('./caches');

    // Network configuration
    const network = Mina.Network({
        mina: process.env.BERKELEY_MINA as string,
        archive: process.env.BERKELEY_ARCHIVE as string,
    });
    Mina.setActiveInstance(network);
    const FEE = 0.101 * 1e9;

    // Accounts configuration
    let configJson: Config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    let acc1: JSONKey = JSON.parse(
        fs.readFileSync(configJson.deployAliases['acc1'].keyPath, 'utf8')
    );
    let acc2: JSONKey = JSON.parse(
        fs.readFileSync(configJson.deployAliases['acc2'].keyPath, 'utf8')
    );
    let acc3: JSONKey = JSON.parse(
        fs.readFileSync(configJson.deployAliases['acc3'].keyPath, 'utf8')
    );
    let acc4: JSONKey = JSON.parse(
        fs.readFileSync(configJson.deployAliases['acc4'].keyPath, 'utf8')
    );

    let feePayerKey: Key;
    feePayerKey = {
        privateKey: PrivateKey.fromBase58(acc1.privateKey),
        publicKey: PublicKey.fromBase58(acc1.publicKey),
    };
    let sender, feePayerNonce;
    do {
        console.log('Fetch nonce...');
        sender = await fetchAccount({ publicKey: feePayerKey.publicKey });
        feePayerNonce = Number(sender.account?.nonce);
        if (!isNaN(feePayerNonce)) {
            console.log('Nonce:', feePayerNonce);
            break;
        }
        await wait(1000); // 1s
    } while (true);

    let addressMerkleTree: { index: Field | number; address: PublicKey }[] = [];

    // Read contract address from config
    await Promise.all(
        Object.keys(Contract)
            .filter((item) => isNaN(Number(item)))
            .map(async (e) => {
                let config = configJson.deployAliases[e.toLowerCase()];
                let keyBase58: { privateKey: string; publicKey: string } =
                    JSON.parse(fs.readFileSync(config.keyPath, 'utf8'));
                let key = {
                    privateKey: PrivateKey.fromBase58(keyBase58.privateKey),
                    publicKey: PublicKey.fromBase58(keyBase58.publicKey),
                };
                addressMerkleTree.push({
                    index: AddressStorage.calculateIndex(ZkAppEnum[e]),
                    address: key.publicKey,
                });
            })
    );

    return {
        feePayer: {
            key: feePayerKey,
            nonce: feePayerNonce,
            fee: FEE,
        },
        cache,
        addressMerkleTree,
    };
}
