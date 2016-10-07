import { mainStory }        from 'storyboard';
import timm                 from 'timm';
import Promise              from 'bluebird';
import {
  GraphQLID,
  GraphQLString,
  GraphQLBoolean,
  // GraphQLInt,
  // GraphQLFloat,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLSchema,
  graphql,
}                           from 'graphql';
import {
  introspectionQuery,
  printSchema,
}                           from 'graphql/utilities';
import {
  nodeDefinitions,
  globalIdField,
  toGlobalId,
  fromGlobalId,
  connectionArgs,
  connectionDefinitions,
  connectionFromArray,
  offsetToCursor,
  mutationWithClientMutationId,
}                           from 'graphql-relay';
import {
  capitalize,
  lowerFirst, upperFirst,
  omitBy,
  isUndefined,
  pick,
}                           from 'lodash';
import * as db              from './db';

// ==============================================
// Private state
// ==============================================
const gqlInterfaces   = {};
const gqlTypes        = {};
const gqlMutations    = {};
let gqlSchema         = null;
const viewer          = { _type: 'Viewer', id: 'me' };
let viewerRootField   = null;

// ==============================================
// Public API
// ==============================================
export function getSchema() { return gqlSchema; }
export function getSchemaShorthand() { return printSchema(gqlSchema); }
export function runQuery(query, operation, rootValue, variables) {
  return graphql(gqlSchema, query, rootValue, null, variables, operation);
}
export function runIntrospect() {
  return Promise.resolve()
  .then(() => graphql(gqlSchema, introspectionQuery))
  .then((result) => {
    if (result.errors) {
      for (const error of result.errors) {
        mainStory.error('gql', 'Error introspecting schema:', { attach: error });
      }
    }
    return result;
  });
}

export function init() {
  // ==============================================
  // Interfaces
  // ==============================================
  mainStory.debug('gql', 'Creating interfaces...');
  const {
    nodeInterface,
    nodeField,
  } = nodeDefinitions(getNodeFromGlobalId, getNodeType);
  gqlInterfaces.Node = nodeInterface;
  const nodeRootField = nodeField;

  // ==============================================
  // Types
  // ==============================================
  mainStory.debug('gql', 'Creating types...');

  let configBaseField       = null;
  let keysBaseField         = null;
  let translationsBaseField = null;

  // ----------------------------------------------
  // Viewer
  // ----------------------------------------------
  gqlTypes.Viewer = new GraphQLObjectType({
    name: 'Viewer',
    interfaces: [gqlInterfaces.Node],
    isTypeOf: (node) => node._type === 'Viewer',
    fields: () => ({
      id: globalIdField('Viewer'),
      config: configBaseField,
      keys: keysBaseField,
      translations: translationsBaseField,
      anyNode: {
        type: gqlInterfaces.Node,
        args: { id: { type: GraphQLID } },
        resolve: (base, args) => getNodeFromGlobalId(args.id),
      },
    }),
  });

  viewerRootField = {
    type: gqlTypes.Viewer,
    resolve: () => viewer,
  };

  // ----------------------------------------------
  // Config
  // ----------------------------------------------
  const configFields = () => ({
    srcPaths:         { type: new GraphQLList(GraphQLString) },
    srcExtensions:    { type: new GraphQLList(GraphQLString) },
    langs:            { type: new GraphQLList(GraphQLString) },
    msgFunctionNames: { type: new GraphQLList(GraphQLString) },
    msgRegexps:       { type: new GraphQLList(GraphQLString) },
    fMinify:          { type: GraphQLBoolean },
    fJsOutput:        { type: GraphQLBoolean },
    fJsonOutput:      { type: GraphQLBoolean },
    fReactIntlOutput: { type: GraphQLBoolean },
  });

  gqlTypes.Config = new GraphQLObjectType({
    name: 'Config',
    interfaces: [gqlInterfaces.Node],
    isTypeOf: () => true,
    fields: () => timm.merge(configFields(), {
      id: globalIdField('Config'),
    }),
  });

  gqlTypes.ConfigUpdate = new GraphQLInputObjectType({
    name: 'ConfigUpdate',
    fields: () => configFields(),
  });

  configBaseField = {
    type: gqlTypes.Config,
    resolve: () => db.getConfig(),
  };

  addMutation('Config', 'UPDATE', { fSingleton: true });

  // ----------------------------------------------
  // Keys
  // ----------------------------------------------
  gqlTypes.Key = new GraphQLObjectType({
    name: 'Key',
    interfaces: [gqlInterfaces.Node],
    isTypeOf: () => true,
    fields: () => ({
      id:             globalIdField('Key'),
      context:        { type: GraphQLString },
      text:           { type: GraphQLString },
      description:    { type: GraphQLString },
      firstUsed:      { type: GraphQLString },
      unusedSince:    { type: GraphQLString },
      sources:        { type: new GraphQLList(GraphQLString) },
      translations: {
        type: gqlTypes.TranslationConnection,
        args: connectionArgs,
        resolve: (base, args) => connectionFromArray(db.getKeyTranslations(base.id), args),
      },
    }),
  });

  gqlTypes.KeyCreate = new GraphQLInputObjectType({
    name: 'KeyCreate',
    fields: () => ({
      context:        { type: GraphQLString },
      text:           { type: GraphQLString },
      firstUsed:      { type: GraphQLString },
      unusedSince:    { type: GraphQLString },
    }),
  });

  gqlTypes.KeyUpdate = new GraphQLInputObjectType({
    name: 'KeyUpdate',
    fields: () => ({
      context:        { type: GraphQLString },
      text:           { type: GraphQLString },
      firstUsed:      { type: GraphQLString },
      unusedSince:    { type: GraphQLString },
    }),
  });

  addConnectionType('Key');

  keysBaseField = {
    type: gqlTypes.KeyConnection,
    args: connectionArgs,
    resolve: (base, args) => connectionFromArray(db.getKeys(), args),
  };

  {
    const parent = {
      type: 'Viewer',
      connection: 'keys',
      resolveConnection: () => db.getKeys(),
    };
    addMutation('Key', 'CREATE', { parent });
    addMutation('Key', 'UPDATE');
    addMutation('Key', 'DELETE', { parent });
  }
  gqlMutations.parseSrcFiles = mutationWithClientMutationId({
    name: 'ParseSrcFiles',
    inputFields: {
      storyId:        { type: GraphQLString },
    },
    mutateAndGetPayload: ({ storyId }) => {
      const story = mainStory.child({
        src: 'gql',
        title: 'Mutation: parse source files',
        extraParents: storyId,
      });
      return db.parseSrcFiles({ story })
      .then(() => ({})) // empty object as a result
      .finally(() => story.close());
    },
    outputFields: {
      keys: keysBaseField,
      viewer: viewerRootField,
    },
  });

  // ----------------------------------------------
  // Translations
  // ----------------------------------------------
  gqlTypes.Translation = new GraphQLObjectType({
    name: 'Translation',
    interfaces: [gqlInterfaces.Node],
    isTypeOf: () => true,
    fields: () => ({
      id:             globalIdField('Translation'),
      lang:           { type: GraphQLString },
      translation:    { type: GraphQLString },
      keyId:          { type: GraphQLID, resolve: (o) => toGlobalId('Key', o.keyId) },
    }),
  });

  gqlTypes.TranslationCreate = new GraphQLInputObjectType({
    name: 'TranslationCreate',
    fields: () => ({
      lang:           { type: GraphQLString },
      translation:    { type: GraphQLString },
      keyId:          { type: GraphQLID },
    }),
  });

  gqlTypes.TranslationUpdate = new GraphQLInputObjectType({
    name: 'TranslationUpdate',
    fields: () => ({
      translation:    { type: GraphQLString },
    }),
  });

  addConnectionType('Translation');

  translationsBaseField = {
    type: gqlTypes.TranslationConnection,
    args: connectionArgs,
    resolve: (base, args) => connectionFromArray(db.getTranslations(), args),
  };

  {
    const globalIds = ['keyId'];
    const parent = {
      type: 'Key',
      connection: 'translations',
      resolveConnection: (key) => db.getKeyTranslations(key.id),
    };
    addMutation('Translation', 'CREATE', { globalIds, parent });
    addMutation('Translation', 'UPDATE', { globalIds });
    addMutation('Translation', 'DELETE', { globalIds, parent });
  }

  gqlMutations.compileTranslations = mutationWithClientMutationId({
    name: 'CompileTranslations',
    inputFields: {
      storyId:        { type: GraphQLString },
    },
    mutateAndGetPayload: ({ storyId }) => {
      const story = mainStory.child({
        src: 'gql',
        title: 'Mutation: compile translations',
        extraParents: storyId,
      });
      return db.compileTranslations({ story })
      .then(() => ({})) // empty object as a result
      .finally(() => story.close());
    },
    outputFields: {},
  });

  // ==============================================
  // Schema
  // ==============================================
  mainStory.debug('gql', 'Creating schema...');
  gqlSchema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: () => ({
        node: nodeRootField,
        viewer: viewerRootField,
      }),
    }),

    mutation: new GraphQLObjectType({
      name: 'Mutation',
      fields: () => pick(gqlMutations, [
        'updateConfig',
        'createKeyInViewerKeys',
        'deleteKeyInViewerKeys',
        'updateKey',
        'parseSrcFiles',
        'createTranslationInKeyTranslations',
        'deleteTranslationInKeyTranslations',
        'updateTranslation',
        'compileTranslations',
      ]),
    }),
  });
}

// ==============================================
// Relay-related helpers
// ==============================================
function getNodeType(node) {
  if (!node) return null;
  return gqlTypes[node._type];
}

function getNodeFromGlobalId(globalId) {
  if (globalId == null) return null;
  const { type, id } = fromGlobalId(globalId);
  return getNodeFromTypeAndLocalId(type, id);
}

function getNodeFromTypeAndLocalId(type, localId) {
  let out;
  switch (type) {
    case 'Viewer':
      out = viewer;
      break;
    case 'Config':
      out = db.getConfig();
      break;
    case 'Key':
      out = db.getKey(localId);
      break;
    case 'Translation':
      out = db.getTranslation(localId);
      break;
    default:
      out = null;
      break;
  }
  return addTypeAttr(out, type);
}

function addTypeAttr(obj, type) {
  return obj
    ? timm.set(obj, '_type', type)
    : obj;
}

function addConnectionType(name) {
  const { connectionType, edgeType } = connectionDefinitions({
    name,
    nodeType: gqlTypes[name],
  });
  gqlTypes[`${name}Connection`] = connectionType;
  gqlTypes[`${name}Edge`] = edgeType;
}

function addMutation(type, op, options = {}) {
  const { parent } = options;
  let name;
  if (parent) {
    name = `${capitalize(op)}${type}In${parent.type}${upperFirst(parent.connection)}`;
  } else {
    name = `${capitalize(op)}${type}`;
  }

  // Input fields
  const inputFields = {};
  if (op !== 'CREATE' && !options.fSingleton) {
    inputFields.id = { type: new GraphQLNonNull(GraphQLID) };
  }
  if (op !== 'DELETE') {
    inputFields.set = { type: gqlTypes[`${type}${capitalize(op)}`] };
    inputFields.unset = { type: new GraphQLList(GraphQLString) };
  }
  if (parent) {
    inputFields.parentId = { type: new GraphQLNonNull(GraphQLID) };
  }
  inputFields.storyId = { type: GraphQLString };

  // The operation
  const mutateAndGetPayload = (mutationArgs) => {
    const { id: globalId, storyId } = mutationArgs;
    const story = mainStory.child({
      src: 'gql',
      title: `Mutation: ${name} ${globalId || ''}`,
      extraParents: storyId,
    });
    return mutate(type, op, mutationArgs, options, story)
    .finally(() => story.close());
  };

  // Output fields
  // - `viewer`
  // - `deletedTypeNameId` [DELETE]
  // - `typeName` [non-DELETE]
  // - `parent` [if in args, typically in CREATE/DELETE]
  const outputFields = { viewer: viewerRootField };
  if (op === 'DELETE') {
    outputFields[`deleted${type}Id`] = {
      type: GraphQLID,
      resolve: ({ globalId }) => globalId,
    };
  } else {
    outputFields[lowerFirst(type)] = {
      type: gqlTypes[type],
      resolve: ({ node }) => node,
    };
  }
  if (parent) {
    outputFields.parent = {
      type: gqlTypes[parent.type],
      resolve: ({ parentNode }) => parentNode,
    };
    if (op === 'CREATE') {
      outputFields[`created${type}Edge`] = {
        type: gqlTypes[`${type}Edge`],
        resolve: ({ node, parentNode }) => {
          if (!node) return null;
          const allNodes = parent.resolveConnection(parentNode);
          const idx = allNodes.findIndex((o) => o.id === node.id);
          const cursor = idx >= 0 ? offsetToCursor(idx) : null;
          return { cursor, node };
        },
      };
    }
  }
  const relations = options.relations != null ? options.relations : [];
  for (const relation of relations) {
    outputFields[relation.name] = {
      type: gqlTypes[relation.type],
      resolve: ({ node }) => relation.resolve(node),
    };
  }

  // Save mutation
  gqlMutations[lowerFirst(name)] = mutationWithClientMutationId({
    name,
    inputFields,
    mutateAndGetPayload,
    outputFields,
  });
}

function mutate(type, op, mutationArgs, options, story) {
  const { id: globalId, parentId: globalParentId, set, unset } = mutationArgs;
  const localId = (op !== 'CREATE' && !options.fSingleton)
    ? fromGlobalId(globalId).id
    : null;
  const parentNode = getNodeFromGlobalId(globalParentId);
  const result = { globalId, localId, globalParentId, parentNode };
  let promise;
  if (op === 'DELETE') {
    promise = db[`delete${type}`](localId, { story })
    .then((node) => { result.node = node; });
  } else {
    let newAttrs = mergeSetUnset(set, unset);
    newAttrs = resolveGlobalIds(newAttrs, options.globalIds);
    if (op === 'CREATE') {
      promise = db[`create${type}`](newAttrs, { story })
      .then((node) => {
        result.node = node;
        result.localId = result.node.id;
      });
    } else {
      if (options.fSingleton) {
        promise = db[`update${type}`](newAttrs, { story });
      } else {
        promise = db[`update${type}`](localId, newAttrs, { story });
      }
      promise = promise.then((node) => { result.node = node; });
    }
  }
  promise = promise.then(() => {
    result.node = addTypeAttr(result.node, type);
    return result;
  });
  return promise;
}

function mergeSetUnset(set = {}, unset = []) {
  const attrs = omitBy(set, isUndefined);
  for (const attr of unset) {
    attrs[attr] = null;
  }
  return attrs;
}

function resolveGlobalIds(prevAttrs, globalIds = []) {
  let attrs = prevAttrs;
  if (attrs == null || !globalIds.length) return attrs;
  for (const locatorPath of globalIds) {
    const tokens = locatorPath.split('.');
    const curToken = tokens[0];
    if (tokens.length === 1) {
      const globalId = attrs[curToken];
      if (globalId == null) continue;
      attrs = timm.set(attrs, curToken, fromGlobalId(globalId).id);
    } else {
      const subLocatorPath = tokens.slice(1).join('.');
      if (curToken === '*') {
        for (let idx = 0; idx < attrs.length; idx++) {
          attrs = timm.set(attrs, idx, resolveGlobalIds(attrs[idx], [subLocatorPath]));
        }
      } else {
        attrs = timm.set(attrs, curToken, resolveGlobalIds(attrs[curToken], [subLocatorPath]));
      }
    }
  }
  return attrs;
}

// function getTypePlural(type) { return `${type}s`; } // obviously, a stub
