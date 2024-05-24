import 'dotenv/config.js';
import fs from 'fs';
import {
    Cache,
    Lightnet,
    Mina,
    PrivateKey,
    PublicKey,
    fetchAccount,
} from 'o1js';
import { Utils } from '@auxo-dev/auxo-libs';
import { Config, JSONKey, Key, Network } from './config.js';
import axios from 'axios';

export async function prepare(
    cacheDir = './caches',
    networkOptions: {
        type?: Network;
        doProofs?: boolean;
    } = {
        type: Network.Local,
        doProofs: false,
    },
    accountOptions: {
        aliases: string[];
        feePayerAlias?: string;
        zkAppAliases?: string[];
    } = {
        aliases: [],
    }
) {
    // Cache folder
    let cache = Cache.FileSystem(cacheDir);

    // Network configuration
    let network;
    switch (networkOptions.type) {
        case Network.Local:
            console.log('Prepare network local');
            network = Mina.LocalBlockchain({
                proofsEnabled: networkOptions.doProofs,
            });
            break;
        case Network.Lightnet:
            console.log('Prepare network lightnet');
            network = Mina.Network({
                mina: process.env.LIGHTNET_MINA as string,
                archive: process.env.LIGHTNET_ARCHIVE as string,
                lightnetAccountManager: process.env
                    .LIGHTNET_ACCOUNT_MANAGER as string,
            });
            break;
        case Network.Testnet:
            console.log('Prepare network testnet');
            network = Mina.Network({
                mina: process.env.BERKELEY_MINA as string,
                archive: process.env.BERKELEY_ARCHIVE as string,
            });
            break;
        case Network.Mainnet:
            throw new Error('Network is not supported!');
        default:
            throw new Error('Unknown network!');
    }
    Mina.setActiveInstance(network);

    // Accounts configuration
    let configJson: Config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    let accounts: { [key: string]: Key } = {},
        feePayer: Utils.FeePayer;
    const DEFAULT_ACCOUNTS = 5;

    if (accountOptions.aliases.length > 0) {
        accountOptions.aliases.map((e) => {
            if (configJson.deployAliases[e] == undefined) {
                let { keys, addresses } = Utils.randomAccounts([e]);
                Object.assign(accounts, {
                    [e]: {
                        privateKey: keys[e],
                        publicKey: addresses[e],
                    },
                });
            } else {
                let accountData: JSONKey = JSON.parse(
                    fs.readFileSync(configJson.deployAliases[e].keyPath, 'utf8')
                );
                Object.assign(accounts, {
                    [e]: {
                        privateKey: PrivateKey.fromBase58(
                            accountData.privateKey
                        ),
                        publicKey: PublicKey.fromBase58(accountData.publicKey),
                    },
                });
            }
        });
    }

    if (networkOptions.type == Network.Lightnet) {
        // let acquiredAccounts = ((await Lightnet.listAcquiredKeyPairs({})) ||
        //     []) as Key[];
        // if (acquiredAccounts.length < DEFAULT_ACCOUNTS) {

        // for (let i = 0; i < DEFAULT_ACCOUNTS; i++) {
        //     let accountData: JSONKey = JSON.parse(
        //         fs.readFileSync(
        //             configJson.deployAliases[`lightnet${i}`].keyPath,
        //             'utf8'
        //         )
        //     );
        //     Object.assign(accounts, {
        //         [i]: {
        //             privateKey: PrivateKey.fromBase58(accountData.privateKey),
        //             publicKey: PublicKey.fromBase58(accountData.publicKey),
        //         },
        //     });
        // }

        // }

        let config = {
            method: 'get',
            maxBodyLength: Infinity,
            url: 'http://localhost:8181/acquire-account',
            headers: {},
        };

        let accountPromise = [];

        for (let i = 0; i < DEFAULT_ACCOUNTS; i++) {
            const promise = new Promise(async (resolve, reject) => {
                try {
                    let data = await axios.request(config);
                    resolve(data.data);
                } catch (error) {
                    reject(error);
                }
            });
            accountPromise.push(promise);
        }

        let fetchedAccountData: { used: boolean; pk: string; sk: string }[] =
            (await Promise.all(accountPromise)) as any;

        for (let i = 0; i < fetchedAccountData.length; i++) {
            Object.assign(accounts, {
                [i]: {
                    privateKey: PrivateKey.fromBase58(fetchedAccountData[i].sk),
                    publicKey: PublicKey.fromBase58(fetchedAccountData[i].pk),
                },
            });
        }
    } else if (networkOptions.type == Network.Local) {
        accounts = {
            ...accounts,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(network as any).testAccounts
                .slice(0, DEFAULT_ACCOUNTS)
                .reduce(
                    (prev: object, curr: Key, index: number) =>
                        Object.assign(prev, { [index]: curr }),
                    {}
                ),
        };
    } else if (networkOptions.type == Network.Testnet) {
        for (let i = 0; i < DEFAULT_ACCOUNTS; i++) {
            let alias = `acc${i}`;
            if (configJson.deployAliases[alias] !== undefined) {
                let accountData: JSONKey = JSON.parse(
                    fs.readFileSync(
                        configJson.deployAliases[alias].keyPath,
                        'utf8'
                    )
                );
                Object.assign(accounts, {
                    [i]: {
                        privateKey: PrivateKey.fromBase58(
                            accountData.privateKey
                        ),
                        publicKey: PublicKey.fromBase58(accountData.publicKey),
                    },
                });
            }
        }
    }

    if (
        accountOptions.feePayerAlias &&
        configJson.deployAliases[accountOptions.feePayerAlias]
    ) {
        let senderData: JSONKey = JSON.parse(
            fs.readFileSync(
                configJson.deployAliases[accountOptions.feePayerAlias].keyPath,
                'utf8'
            )
        );
        feePayer = {
            sender: {
                privateKey: PrivateKey.fromBase58(senderData.privateKey),
                publicKey: PublicKey.fromBase58(senderData.publicKey),
            },
        };
    } else {
        feePayer = {
            sender: accounts[0],
        };
    }

    if (networkOptions.type !== Network.Local)
        try {
            let { account, error } = await fetchAccount({
                publicKey: feePayer.sender.publicKey,
            });
            if (error) throw error;
            if (account !== undefined) feePayer.nonce = Number(account.nonce);
            console.log('Nonce:', feePayer.nonce || 0);
        } catch (error) {
            console.error(error);
        }

    return {
        network,
        deployed: configJson.deployAliases,
        accounts,
        feePayer,
        cache,
    };
}
