import path from "path";
import fs from "fs";
import chalk from 'chalk';

import { replacePathSepForRegex } from "best-regex-util";
import { PACKAGE_JSON, BEST_CONFIG } from "./constants";
import DEFAULT_CONFIG from './defaults';

const specialArgs = ['_', '$0', 'h', 'help', 'config'];
const isFile = filePath => fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory();

function readConfigAndSetRootDir(configPath) {
    const isJSON = configPath.endsWith('.json');
    let configObject;

    try {
        configObject = require(configPath);
    } catch (error) {
        if (isJSON) {
            throw new Error(`Best: Failed to parse config file ${configPath}\n`);
        } else {
            throw error;
        }
    }

    if (configPath.endsWith(PACKAGE_JSON)) {
        configObject = configObject.jest || {};
    }

    if (configObject.rootDir) {
        // We don't touch it if it has an absolute path specified
        if (!path.isAbsolute(configObject.rootDir)) {
            // otherwise, we'll resolve it relative to the file's __dirname
            configObject.rootDir = path.resolve(
                path.dirname(configPath),
                configObject.rootDir,
            );
        }
    } else {
        // If rootDir is not there, we'll set it to this file's __dirname
        configObject.rootDir = path.dirname(configPath);
    }

    return configObject;
}

function resolveConfigPathByTraversing(pathToResolve, initialPath, cwd) {
    const bestConfig = path.resolve(pathToResolve, BEST_CONFIG);
    if (isFile(bestConfig)) {
        return bestConfig;
    }

    const packageJson = path.resolve(pathToResolve, PACKAGE_JSON);
    if (isFile(packageJson)) {
        return packageJson;
    }

    if (pathToResolve === path.dirname(pathToResolve)) {
        throw new Error('Config not found');
    }

    // go up a level and try it again
    return resolveConfigPathByTraversing(path.dirname(pathToResolve), initialPath, cwd);
}

function resolveConfigPath(pathToResolve, cwd) {
    const absolutePath = path.isAbsolute(pathToResolve) ? pathToResolve : path.resolve(cwd, pathToResolve);
    if (isFile(absolutePath)) {
        return absolutePath;
    }

    return resolveConfigPathByTraversing(absolutePath, pathToResolve, cwd);
}

function setFromArgs(initialOptions, argsCLI) {
    const argvToOptions = Object.keys(argsCLI)
        .filter(key => argsCLI[key] !== undefined && specialArgs.indexOf(key) === -1)
        .reduce((options, key) => {
            switch (key) {
                case 'env':
                    options.testEnvironment = argsCLI[key];
                    break;

                default: options[key] = argsCLI[key];
            }
        }, {});

    return Object.assign({}, initialOptions, argvToOptions);
}

function normalizeRootDir(options) {
    // Assert that there *is* a rootDir
    if (!options.hasOwnProperty('rootDir')) {
        throw new Error(`  Configuration option ${chalk.bold('rootDir')} must be specified.`,);
    }

    options.rootDir = path.normalize(options.rootDir);
    return options;
}

function buildTestPathPattern(argsCLI) {
    const patterns = [];
    if (argsCLI._) {
        patterns.push(...argsCLI._);
    }

    if (argsCLI.testPathPattern) {
        patterns.push(...argsCLI.testPathPattern);
    }

    const testPathPattern = patterns.map(replacePathSepForRegex).join('|');
    return testPathPattern;
}

function normalize(options, argsCLI) {
    options = normalizeRootDir(setFromArgs(options, argsCLI));
    const newOptions = Object.assign({}, DEFAULT_CONFIG);

    Object.keys(options).reduce((newOpts, key) => {
        let value = newOpts[key];
        switch (key) {
            default: value = options[key];
        }
        newOptions[key] = value;
        return newOpts;
    }, newOptions);

    newOptions.nonFlagArgs = argsCLI._;
    newOptions.testPathPattern = buildTestPathPattern(argsCLI);
    return newOptions;
}

function _getConfigs(options) {
    return {
        globalConfig: Object.freeze({
            detectLeaks: options.detectLeaks,
            outputFile: options.outputFile,
            projects: options.projects,
            rootDir: options.rootDir,
            testNamePattern: options.testNamePattern,
            testPathPattern: options.testPathPattern,
            verbose: options.verbose,
        }),
        projectConfig: Object.freeze({
            cache: options.cache,
            cacheDirectory: options.cacheDirectory,
            cwd: options.cwd,
            detectLeaks: options.detectLeaks,
            displayName: options.displayName,
            globals: options.globals,
            moduleDirectories: options.moduleDirectories,
            moduleFileExtensions: options.moduleFileExtensions,
            moduleLoader: options.moduleLoader,
            moduleNameMapper: options.moduleNameMapper,
            modulePathIgnorePatterns: options.modulePathIgnorePatterns,
            modulePaths: options.modulePaths,
            name: options.name,
            resolver: options.resolver,
            rootDir: options.rootDir,
            roots: options.roots,
            runner: options.runner,
            testEnvironment: options.testEnvironment,
            testEnvironmentOptions: options.testEnvironmentOptions,
            testLocationInResults: options.testLocationInResults,
            testMatch: options.testMatch,
            testPathIgnorePatterns: options.testPathIgnorePatterns,
            testRegex: options.testRegex,
            testRunner: options.testRunner,
            testURL: options.testURL,
            transform: options.transform,
            transformIgnorePatterns: options.transformIgnorePatterns,
        })
    };
}

export function readConfig(argsCLI, packageRoot) {
    const customConfigPath = argsCLI.config ? argsCLI.config : packageRoot;
    const configPath = resolveConfigPath(customConfigPath, process.cwd());
    const rawOptions = readConfigAndSetRootDir(configPath);
    const options = normalize(rawOptions, argsCLI);
    const { globalConfig, projectConfig } = _getConfigs(options);

    return { globalConfig, projectConfig };
}

export function getConfigs(projectsFromCLIArgs, argv, outputStream) {
    let globalConfig;
    let hasDeprecationWarnings;
    let configs = [];
    let projects = projectsFromCLIArgs;

    if (projectsFromCLIArgs.length === 1) {
        const parsedConfig = readConfig(argv, projects[0]);

        if (parsedConfig.globalConfig.projects) {
            // If this was a single project, and its config has `projects`
            // settings, use that value instead.
            projects = parsedConfig.globalConfig.projects;
        }

        hasDeprecationWarnings = parsedConfig.hasDeprecationWarnings;
        globalConfig = parsedConfig.globalConfig;
        configs = [parsedConfig.projectConfig];

        if (globalConfig.projects && globalConfig.projects.length) {
            // Even though we had one project in CLI args, there might be more
            // projects defined in the config.
            projects = globalConfig.projects;
        }
    }

    if (projects.length > 1) {
        throw new Error("WIP");
    }

    return {
        configs,
        globalConfig,
        hasDeprecationWarnings: !!hasDeprecationWarnings,
    };
}
