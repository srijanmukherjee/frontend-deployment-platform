const {RunTaskCommandInput} = require('@aws-sdk/client-ecs');

/**
 * creates a ne deployment task configuration
 * 
 * @param {string} gitRepositoryUrl 
 * @param {string} projectId
 * 
 * @returns {RunTaskCommandInput}
 */
function createNewDeploymentConfiguration(gitRepositoryUrl, projectId) {
    return {
        cluster: process.env.AWS_DEPLOYMENT_CLUSTER_ARN,
        taskDefinition: process.env.AWS_DEPLOYMENT_TASK_DEFINITION_ARN,
        launchType: process.env.AWS_DEPLOYMENT_LAUNCH_TYPE,
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration: {
                subnets: process.env.AWS_DEPLOYMENT_VPC_CONFIGURATION_SUBNETS.split(','),
                securityGroups: process.env.AWS_DEPLOYMENT_VPC_CONFIGURATION_SECURITY_GROUPS.split(','),
                assignPublicIp: 'ENABLED'
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: process.env.AWS_DEPLOYMENT_TASK_DEFINITION_IMAGE_NAME,
                    environment: [
                        {
                            name: "GIT_REPOSITORY_URL",
                            value: gitRepositoryUrl
                        },
                        {
                            name: "PROJECT_ID",
                            value: projectId
                        },
                        {
                            name: 'REDIS_URI',
                            value: process.env.REDIS_URI
                        }
                    ]
                }
            ]
        }
    };
}

module.exports = { createNewDeploymentConfiguration };