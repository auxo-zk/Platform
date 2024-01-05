const fs = require('fs');
const path = require('path');
const os = require('os');

// Get the home directory
const homeDirectory = os.homedir();

// Construct the full path
const directoryPath = path.join(homeDirectory, '.cache/o1js');

// Function to check if 'pk' is not in the file name
const is_valid_file = (fileName) => !(fileName.includes('pk') || fileName.includes('header'));

// Read all files from the directory and filter based on the condition
fs.readdir(directoryPath, (err, files) => {
  if (err) {
    console.error('Error reading the directory:', err);
    return;
  }

  const validFiles = files.filter(
    (file) =>
      is_valid_file(file) &&
      fs.statSync(path.join(directoryPath, file)).isFile()
  );

  // Generating the output
  let output = 'const cacheContractFile = [\n';
  output += validFiles
    .map((fileName) => `    { name: '${fileName}', type: 'string' }`)
    .join(',\n');
  output += '\n];';

  // Print the generated code
  console.log(output);
});
