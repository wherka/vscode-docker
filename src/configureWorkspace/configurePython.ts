/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import vscode = require('vscode');
import { ext } from "../extensionVariables";
import { WorkspaceFolder } from 'vscode';
import { IActionContext } from 'vscode-azureextensionui';
import { DockerDebugScaffoldContext } from '../debugging/DebugHelper';
import { dockerDebugScaffoldingProvider } from '../debugging/DockerDebugScaffoldingProvider';
import { PythonScaffoldingOptions } from '../debugging/python/PythonDebugHelper';
import { PlatformOS } from '../utils/platform';
import { getComposePorts, getExposeStatements, IPlatformGeneratorInfo, PackageInfo } from './configure';
import { ScaffoldFile } from './scaffolding';
import { PythonExtensionHelper } from '../tasks/python/PythonExtensionHelper';

export let configurePython: IPlatformGeneratorInfo = {
  genDockerFile,
  genDockerCompose,
  genDockerComposeDebug,
  defaultPorts: [3000],
  initializeForDebugging: initializeForDebugging,
  genAdditionalFiles: genAdditionalFiles
};

export async function promptForLaunchFile(prompt: string, defaultFile: string) : Promise<string>{
  let opt: vscode.InputBoxOptions = {
    placeHolder: defaultFile,
    prompt: prompt,
    value: defaultFile,
    validateInput: (value: string): string | undefined => { return value && value.trim().length > 0 ? undefined : "Enter a valid Python file path." }
  };

  return await ext.ui.showInputBox(opt);
}

function genDockerFile(serviceNameAndRelativePath: string, platform: string, os: string | undefined, ports: number[], { cmd, author, version, artifactName }: Partial<PackageInfo>): string {
  let exposeStatements = getExposeStatements(ports);

  return `# For more information, please refer to https://aka.ms/vscode-docker-python
FROM python:alpine

${exposeStatements}

# Install pip requirements
ADD requirements.txt .
RUN python3 -m pip install -r requirements.txt

WORKDIR /app
ADD . /app

CMD ["python3", "-m", "${serviceNameAndRelativePath}"]
`;
}

function genDockerCompose(serviceNameAndRelativePath: string, platform: string, os: string | undefined, ports: number[]): string {
  return `version: '2.1'

services:
  ${serviceNameAndRelativePath}:
    image: ${serviceNameAndRelativePath}
    build:
      context: .
      dockerfile: Dockerfile
${getComposePorts(ports)}`;
}

function genDockerComposeDebug(serviceNameAndRelativePath: string, platform: string, os: string | undefined, ports: number[], { fullCommand: cmd }: Partial<PackageInfo>): string {
  const defaultDebugPort = 5678;
  const defaultDebugOptions : PythonExtensionHelper.DebugLaunchOptions =
  {
    host: "0.0.0.0",
    port: defaultDebugPort,
    wait: true
  };

  const file : PythonExtensionHelper.ModuleTarget =
  {
    module: serviceNameAndRelativePath
  };

  const launcherCommand = PythonExtensionHelper.getRemoteLauncherCommand(file, undefined, defaultDebugOptions);
  const entrypoint = 'python '.concat(launcherCommand);

  return `version: '2.1'

services:
  ${serviceNameAndRelativePath}:
    image: ${serviceNameAndRelativePath}
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ${PythonExtensionHelper.getLauncherFolderPath()}:/pydbg
    entrypoint: ${entrypoint}
${getComposePorts(ports, defaultDebugPort)}`;
}

async function genAdditionalFiles(): Promise<ScaffoldFile[]> {
  const contents = '# Add requirements when needed'
  const fileName = 'requirements.txt'

  return [{ contents: contents, fileName: fileName }];
}

async function initializeForDebugging(context: IActionContext, folder: WorkspaceFolder, platformOS: PlatformOS, dockerfile: string, packageInfo: PackageInfo, ports: number[], generateComposeFiles: boolean): Promise<void> {
  const scaffoldContext: DockerDebugScaffoldContext = {
      folder: folder,
      platform: 'python',
      actionContext: context,
      dockerfile: dockerfile,
      generateComposeTask: generateComposeFiles
  }

  const pyOptions: PythonScaffoldingOptions = {
      projectType: 'general',
      platformOS: platformOS,
      filePath: await promptForLaunchFile("Enter the path to the application, e.g. 'app.py' or 'app'", "app.py")
  }

  await dockerDebugScaffoldingProvider.initializePythonForDebugging(scaffoldContext, pyOptions);
}
