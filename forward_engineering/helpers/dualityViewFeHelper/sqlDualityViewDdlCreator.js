const {AbstractDualityViewFeDdlCreator} = require('./abstractDualityViewDdlCreator');


class SqlDualityViewDdlCreator extends AbstractDualityViewFeDdlCreator {

    /**
     * @param ddlTemplates {Object}
     * @param lodash {any}
     * @param assignTemplates {(template: string, values: Object) => string}
     * @throws {Error}
     * */
    constructor(ddlTemplates, assignTemplates, lodash) {
        super(ddlTemplates, assignTemplates, lodash);
    }

    /**
     * @param view {Object}
     * @return {string}
     * */
    _getFromRootTableAliasStatement(view) {
        if (view.rootTableAlias) {
            const ddlAlias = view.rootTableAlias;
            return AbstractDualityViewFeDdlCreator.padInFront(ddlAlias);
        }
        return '';
    }

    /**
     * @param joinSubqueryJsonSchema {Object}
     * @return {string}
     * */
    _getFromChildTableAliasStatement(joinSubqueryJsonSchema) {
        if (joinSubqueryJsonSchema.childTableAlias) {
            const ddlAlias = joinSubqueryJsonSchema.childTableAlias;
            return AbstractDualityViewFeDdlCreator.padInFront(ddlAlias);
        }
        return '';
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getCheckStatement(tagsClause) {
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(tagsClause.check);
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getEtagStatement(tagsClause) {
        const etag = tagsClause.etag ? 'etag' : ''
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(etag);
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getDeleteStatement(tagsClause) {
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(tagsClause.delete);
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getInsertStatement(tagsClause) {
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(tagsClause.insert);
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getUpdateStatement(tagsClause) {
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(tagsClause.update);
    }

    /**
     * @param entity {Object}
     * @return {string}
     * */
    _getTableTagsStatement(entity) {
        const tagsClause = entity.tableTagsClause || {};
        const checkStatement = this._getCheckStatement(tagsClause);
        let etagStatement = '';
        if (checkStatement) {
            etagStatement = this._getEtagStatement(tagsClause);
        }
        const insertStatement = this._getInsertStatement(tagsClause);
        const updateStatement = this._getUpdateStatement(tagsClause);
        const deleteStatement = this._getDeleteStatement(tagsClause);

        const ddlConfig = {
            checkStatement, etagStatement, insertStatement, updateStatement, deleteStatement
        }
        const statements = Object.values(ddlConfig);
        if (statements.some(s => s?.length)) {
            const template = this._ddlTemplates.dualityView.sql.tableTagsStatement;
            const statement = this._assignTemplates(template, ddlConfig)
            return AbstractDualityViewFeDdlCreator.padInFront(statement);
        }
        return '';
    }

    /**
     * @param entity {Object}
     * @return {string}
     * */
    _getColumnTagsStatement(entity) {
        const tagsClause = entity.columnTagsClause || {};
        const checkStatement = this._getCheckStatement(tagsClause);
        let etagStatement = '';
        if (checkStatement) {
            etagStatement = this._getEtagStatement(tagsClause);
        }
        const updateStatement = this._getUpdateStatement(tagsClause);

        const ddlConfig = {
            checkStatement, etagStatement, updateStatement
        }
        const statements = Object.values(ddlConfig);
        if (statements.some(s => s?.length)) {
            const template = this._ddlTemplates.dualityView.sql.columnTagsStatement;
            const statement = this._assignTemplates(template, ddlConfig)
            return AbstractDualityViewFeDdlCreator.padInFront(statement);
        }
        return '';
    }

    /**
     * @param view {Object}
     * @return {string}
     * */
    _getFromRootTableStatement(view) {
        const {getNamePrefixedWithSchemaName} = require('../../utils/general')(this._lodash);
        const ddlTableName = getNamePrefixedWithSchemaName(view.tableName, view.schemaName);
        const aliasStatement = this._getFromRootTableAliasStatement(view);
        const tagsClauseStatement = this._getTableTagsStatement(view);

        const template = this._ddlTemplates.dualityView.sql.fromTableStatement;
        return this._assignTemplates(template, {
            tableName: ddlTableName,
            tableAlias: aliasStatement,
            tableTagsStatement: tagsClauseStatement,
        })
    }

    /**
     * @param joinSubqueryJsonSchema {Object}
     * @param relatedSchemas {Object}
     * @return {string}
     * */
    _getFromChildTableStatement({ joinSubqueryJsonSchema, relatedSchemas }) {
        const collectionId = this._lodash.first(joinSubqueryJsonSchema.joinedCollectionRefIdPath);
        if (!collectionId) {
            throw new Error('Specify child table for all join subqueries');
        }
        const child = relatedSchemas[collectionId];

        const {getEntityName, getNamePrefixedWithSchemaName} = require('../../utils/general')(this._lodash);
        const tableName = getEntityName(child);
        const schemaName = child.bucketName;

        const ddlTableName = getNamePrefixedWithSchemaName(tableName, schemaName);
        const aliasStatement = this._getFromChildTableAliasStatement(joinSubqueryJsonSchema);
        const tagsClauseStatement = this._getTableTagsStatement(joinSubqueryJsonSchema);

        const template = this._ddlTemplates.dualityView.sql.fromTableStatement;
        const fromTableStatement = this._assignTemplates(template, {
            tableName: ddlTableName,
            tableAlias: aliasStatement,
            tableTagsStatement: tagsClauseStatement,
        });
        const statements = [fromTableStatement];
        if (joinSubqueryJsonSchema.whereClause) {
            statements.push('WHERE');
            statements.push(joinSubqueryJsonSchema.whereClause);
        }
        return statements.join(' ');
    }

    /**
     * @param parentEntity {Object}
     * @param propertyName {string}
     * @param relatedSchemas {Object}
     * @return {string}
     * */
    _getNameOfReferencedColumnForDdl(parentEntity, propertyName, relatedSchemas) {
        const {getEntityName, getNamePrefixedWithSchemaName} = require('../../utils/general')(this._lodash);
        if (AbstractDualityViewFeDdlCreator.isDualityView(parentEntity)) {
            const parentName = parentEntity.rootTableAlias || parentEntity.tableName;
            // return getNamePrefixedWithSchemaName(propertyName, parentName);
            return `${parentName}."${propertyName}"`;
        }
        if (AbstractDualityViewFeDdlCreator.isJoinSubquery(parentEntity)) {
            if (parentEntity.childTableAlias) {
                const parentName = parentEntity.childTableAlias;
                // return getNamePrefixedWithSchemaName(propertyName, parentName);
                return `${parentName}."${propertyName}"`;
            }
            const collectionId = this._lodash.first(parentEntity.joinedCollectionRefIdPath);
            if (collectionId) {
                const collection = relatedSchemas[collectionId];
                const parentName = getEntityName(collection);
                // return getNamePrefixedWithSchemaName(propertyName, parentName);
                return `${parentName}."${propertyName}"`;
            }
        }
        return '';
    }

    /**
     * @param propertyName {string}
     * @param propertyJsonSchema {Object}
     * @return {string}
     * */
    _getRegularFieldName(propertyName, propertyJsonSchema) {
        return propertyJsonSchema.jsonKey || propertyName;
    }

    /**
     * @param propertyName {string}
     * @param propertyJsonSchema {Object}
     * @param parent {Object}
     * @param paddingFactor {number}
     * @param relatedSchemas {Object}
     * @return {string}
     * */
    _getRegularFieldKeyValueStatement({
                                            propertyName,
                                            propertyJsonSchema,
                                            parent,
                                            paddingFactor,
                                            relatedSchemas
                                        }) {
        const {wrap} = require('../../utils/general')(this._lodash);

        const padding = AbstractDualityViewFeDdlCreator.getKeyValueFrontPadding(paddingFactor);
        const keyName = this._getRegularFieldName(propertyName, propertyJsonSchema);
        const ddlKeyName = wrap(keyName, "'", "'");

        const fieldName = AbstractDualityViewFeDdlCreator.getRegularFieldNameFromCollection(propertyJsonSchema.refIdPath, relatedSchemas);
        const ddlFieldName = this._getNameOfReferencedColumnForDdl(parent, fieldName, relatedSchemas);

        const columnTagsStatement = this._getColumnTagsStatement(propertyJsonSchema);

        return `${padding}${ddlKeyName}: ${ddlFieldName}${columnTagsStatement}`;
    }

    /**
     * @param propertyJsonSchema {Object}
     * @param paddingFactor {number}
     * @param relatedSchemas {Object}
     * @return {string}
     * */
    _getJoinSubqueryValueStatement({
                                         propertyJsonSchema,
                                         paddingFactor,
                                         relatedSchemas
                                     }) {
        const bodyPaddingFactor = paddingFactor + 1;
        const childrenPaddingFactor = paddingFactor + 2;

        const objectGenStatement = this._getObjectGenStatement({
            paddingFactor: childrenPaddingFactor,
            relatedSchemas,
            jsonSchema: propertyJsonSchema
        });
        const bodyPadding = AbstractDualityViewFeDdlCreator.getKeyValueFrontPadding(bodyPaddingFactor);
        const bodyWithGenStatement = `${bodyPadding}SELECT${objectGenStatement}`;
        const body = [bodyWithGenStatement];
        const fromStatement = this._getFromChildTableStatement({
            joinSubqueryJsonSchema: propertyJsonSchema,
            relatedSchemas
        });
        body.push(bodyPadding + fromStatement);

        return body.join('\n');
    }

    /**
     * @param propertyName {string}
     * @param propertyJsonSchema {Object}
     * @param paddingFactor {number}
     * @param relatedSchemas {Object}
     * @return {string}
     * */
    _getJoinSubqueryKeyValueStatement({
                                            propertyName,
                                            propertyJsonSchema,
                                            paddingFactor,
                                            relatedSchemas
                                        }) {
        const {wrap} = require('../../utils/general')(this._lodash);

        const valueStatement = this._getJoinSubqueryValueStatement({
            relatedSchemas,
            paddingFactor,
            propertyJsonSchema,
        });
        const padding = AbstractDualityViewFeDdlCreator.getKeyValueFrontPadding(paddingFactor);
        const jsonKeywordConfig = this._getObjectGenStatementJsonKeywordConfig(propertyJsonSchema);
        const openingBracket = jsonKeywordConfig.surroundingBrackets[0];
        const closingBracket = jsonKeywordConfig.surroundingBrackets[1];

        if (propertyJsonSchema.unnestSubquery) {
            return `${padding}UNNEST ${openingBracket}\n${valueStatement}\n${padding}${closingBracket}`
        }
        const subqueryName = this._getJoinSubqueryName(propertyName, propertyJsonSchema);
        const subqueryDdlName = wrap(subqueryName, "'", "'");

        return `${padding}${subqueryDdlName} : ${openingBracket}\n${valueStatement}\n${padding}${closingBracket}`;
    }

    /**
     * @param propertyName {string}
     * @param propertyJsonSchema {Object}
     * @return {string}
     * */
    _getJoinSubqueryName(propertyName, propertyJsonSchema) {
        return propertyJsonSchema.name || propertyName;
    }

    /**
     * @param propertyName {string}
     * @param propertyJsonSchema {Object}
     * @param parent {Object}
     * @param paddingFactor {number}
     * @param relatedSchemas {Object}
     * @return {string}
     * */
    _buildKeyValueStatement({propertyName, propertyJsonSchema, parent, paddingFactor, relatedSchemas}) {
        if (AbstractDualityViewFeDdlCreator.isRegularDualityViewField(propertyJsonSchema)) {
            return this._getRegularFieldKeyValueStatement({
                propertyName,
                propertyJsonSchema,
                parent,
                paddingFactor,
                relatedSchemas
            });
        }
        if (AbstractDualityViewFeDdlCreator.isJoinSubquery(propertyJsonSchema)) {
            return this._getJoinSubqueryKeyValueStatement({
                propertyName,
                propertyJsonSchema,
                paddingFactor,
                relatedSchemas
            });
        }
        return '';
    }

    /**
     * @param jsonSchema {Object}
     * @param relatedSchemas {Object}
     * @param paddingFactor {number}
     * @return {string}
     * */
    _getKeyValueStatement({jsonSchema, relatedSchemas, paddingFactor}) {
        const statements = [];
        const propertyNameToJsonSchemaPairs = this._lodash.toPairs(jsonSchema.properties || {});
        for (const [propertyName, propertyJsonSchema] of propertyNameToJsonSchemaPairs) {
            const statement = this._buildKeyValueStatement({
                propertyName,
                propertyJsonSchema,
                parent: jsonSchema,
                paddingFactor,
                relatedSchemas
            });
            statements.push(statement);
        }
        const result = statements.join(',\n');
        return `\n${result}\n`;
    }

    /**
     * @param jsonSchema {Object}
     * @return {{
     *     jsonKeyword: string,
     *     surroundingBrackets: [string, string],
     *     jsonKeywordBrackets: [string, string],
     * }}
     * */
    _getObjectGenStatementJsonKeywordConfig(jsonSchema) {
        if (!AbstractDualityViewFeDdlCreator.isJoinSubquery(jsonSchema)) {
            return {
                jsonKeyword: 'JSON',
                surroundingBrackets: ['', ''],
                jsonKeywordBrackets: ['{', '}']
            };
        }
        const sqlJsonFunction = this._lodash.toUpper(jsonSchema.sqlJsonFunction);
        if (sqlJsonFunction === 'JSON_OBJECT') {
            return {
                jsonKeyword: sqlJsonFunction,
                surroundingBrackets: ['(', ')'],
                jsonKeywordBrackets: ['(', ')']
            };
        }
        if (sqlJsonFunction === 'JSON_ARRAYAGG') {
            return {
                jsonKeyword: sqlJsonFunction,
                surroundingBrackets: ['(', ')'],
                jsonKeywordBrackets: ['( JSON {', '})']
            };
        }
        const subqueryType = this._lodash.toLower(jsonSchema.subqueryType);
        if (subqueryType === 'array') {
            return {
                jsonKeyword: 'JSON',
                surroundingBrackets: ['[', ']'],
                jsonKeywordBrackets: ['{', '}']
            };
        }
        return {
            jsonKeyword: 'JSON',
            surroundingBrackets: ['(', ')'],
            jsonKeywordBrackets: ['{', '}']
        };
    }

    /**
     * @param jsonSchema {Object}
     * @param relatedSchemas {Object}
     * @param paddingFactor {number}
     * @return {string}
     * */
    _getObjectGenStatement({
                               relatedSchemas,
                               paddingFactor,
                               jsonSchema
                           }) {
        const keyValueStatement = this._getKeyValueStatement({
            relatedSchemas,
            paddingFactor,
            jsonSchema
        });
        const padding = AbstractDualityViewFeDdlCreator.getKeyValueFrontPadding(paddingFactor - 1);
        const jsonKeywordConfig = this._getObjectGenStatementJsonKeywordConfig(jsonSchema);
        const openingBracket = jsonKeywordConfig.jsonKeywordBrackets[0];
        const closingBracket = jsonKeywordConfig.jsonKeywordBrackets[1];

        const template = `${jsonKeywordConfig.jsonKeyword} ${openingBracket}\${keyValueStatement}${padding}${closingBracket}`;
        const objectGenClause = this._assignTemplates(template, {
            keyValueStatement
        });
        return AbstractDualityViewFeDdlCreator.padInFront(objectGenClause);
    }

    getDualityViewBodyDdl(createViewDto) {
        const { view, jsonSchema, relatedSchemas } = createViewDto;
        const objectGenStatement = this._getObjectGenStatement({
            jsonSchema,
            paddingFactor: 1,
            relatedSchemas
        });
        const bodyWithGenStatement = `SELECT${objectGenStatement}`;
        const body = [bodyWithGenStatement];
        const fromRootTableStatement = this._getFromRootTableStatement(view);
        body.push(fromRootTableStatement + ';');
        return body.join('\n');
    }
}

module.exports = {
    SqlDualityViewDdlCreator,
}
