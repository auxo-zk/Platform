import fs from 'fs';
import { PrivateKey, PublicKey } from 'o1js';

interface key {
    privateKey: string;
    publicKey: string;
}

// Define the data for each file
let filesData: key[] = [];

// Define the file names as an array
const fileNames = [
    'committee.json',
    'dkg.json',
    'round1.json',
    'round2.json',
    'response.json',
    'request.json',
    'project.json',
    'campaign.json',
    'participation.json',
    'funding.json',
    'treasury.json',
];

function createFileData() {
    let tempFilesData: key[] = [];
    for (let i = 0; i < fileNames.length; i++) {
        let sk: PrivateKey = PrivateKey.random();
        let pk: PublicKey = sk.toPublicKey();
        tempFilesData.push({
            privateKey: sk.toBase58(),
            publicKey: pk.toBase58(),
        });
    }
    filesData = tempFilesData;
}

// Function to write the files
function writeFiles() {
    filesData.forEach((data, index) => {
        const path = './keys/';
        let fileName = fileNames[index];
        fileName = path + fileName;
        const fileContent = JSON.stringify(data, null, 2);

        fs.writeFile(fileName, fileContent, (err) => {
            if (err) {
                console.error(`Error writing ${fileName}:`, err);
            } else {
                console.log(`${fileName} created successfully.`);
            }
        });
    });
}

interface Key {
    privateKey: string;
    publicKey: string;
}

interface DeployAlias {
    url: string;
    keyPath: string;
    feepayerKeyPath: string;
    feepayerAlias: string;
    fee: string;
}

interface DeployAliases {
    version: number;
    deployAliases: {
        [alias: string]: DeployAlias;
    };
}

// Existing code...

function createDeployAliases(): DeployAliases {
    const deployAliases: DeployAliases = {
        version: 1,
        deployAliases: {},
    };

    fileNames.forEach((fileName) => {
        const alias = fileName.split('.')[0]; // Get the alias name from the file name
        deployAliases.deployAliases[alias] = {
            url: 'https://proxy.berkeley.minaexplorer.com/graphql',
            keyPath: `keys/${fileName}`,
            feepayerKeyPath:
                '/home/huyminh/.cache/zkapp-cli/keys/myaccount.json',
            feepayerAlias: 'myaccount',
            fee: '0.1',
        };
    });

    return deployAliases;
}

function writeDeployAliasesFile() {
    const deployAliases = createDeployAliases();
    const fileName = './config.json'; // Specify the new file name
    const fileContent = JSON.stringify(deployAliases, null, 2);

    fs.writeFile(fileName, fileContent, (err) => {
        if (err) {
            console.error(`Error writing ${fileName}:`, err);
        } else {
            console.log(`${fileName} created successfully.`);
        }
    });
}

// Rest of the code...

// Call the existing functions
createFileData();
writeFiles();
// Call the new function to write the deploy aliases file
// writeDeployAliasesFile();
