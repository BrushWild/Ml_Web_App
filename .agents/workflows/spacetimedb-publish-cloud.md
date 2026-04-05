---
description: Deploys the SpacetimeDB module to Maincloud (production). Use when the application is ready for global access or persistent hosting.
---

# Publish SpacetimeDB Maincloud

This skill manages the deployment of a module to the official SpacetimeDB managed cloud service. It makes your database accessible over the internet.

## When to use this workflow

- Use this when moving from local testing to a production or staging environment.
- This is helpful when you need persistent uptime that isn't dependent on your local machine.
- Use this to update a live application that users are already connected to.

## How to use it

1. **Authentication:** Ensure you are logged into the CLI. If not, run:
   `spacetime login`
2. **Cloud Deployment:** Publish the module to the Maincloud server:
   `spacetime publish <database-name> --server maincloud`
3. **Managing Migrations:**
   - If you have changed your schema in a way that is incompatible with existing data, DO NOT FORCE DELETE THE DATABASE. Stop and evaluate the breaking changes then warn the user of the conflict.
4. **Post-Publish:** Provide the user with the Maincloud URI and the database identity to configure their production client builds.