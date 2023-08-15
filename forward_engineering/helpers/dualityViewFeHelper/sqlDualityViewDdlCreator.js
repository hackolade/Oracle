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
     * @param createViewDto {CreateViewDto}
     * @return {string}
     * */
    _getFromRootTableAliasStatement(createViewDto) {
        const { view } = createViewDto;
        if (view.rootTableAlias) {
            return this.padInFront(view.rootTableAlias);
        }
        return '';
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getCheckStatement(tagsClause) {
        return this.padInFrontAndUppercaseIfExists(tagsClause.check);
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getEtagStatement(tagsClause) {
        const etag = tagsClause.etag ? 'etag' : ''
        return this.padInFrontAndUppercaseIfExists(etag);
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getDeleteStatement(tagsClause) {
        return this.padInFrontAndUppercaseIfExists(tagsClause.delete);
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getInsertStatement(tagsClause) {
        return this.padInFrontAndUppercaseIfExists(tagsClause.insert);
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getUpdateStatement(tagsClause) {
        return this.padInFrontAndUppercaseIfExists(tagsClause.update);
    }

    /**
     * @param createViewDto {CreateViewDto}
     * @return {string}
     * */
    _getTableTagsStatement(createViewDto) {
        const { view } = createViewDto;
        const tagsClause = view.rootTableTagsClause || {};
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
            return this.padInFront(statement);
        }
        return '';
    }

    /**
     * @param createViewDto {CreateViewDto}
     * @return {string}
     * */
    _getFromRootTableStatement(createViewDto) {
        const tableName = ''
        const aliasStatement = this._getFromRootTableAliasStatement(createViewDto);
        const tagsClauseStatement = this._getTableTagsStatement(createViewDto);

        const template = this._ddlTemplates.dualityView.sql.fromRootTableStatement;
        return this._assignTemplates(template, {
            tableName,
            tableAlias: aliasStatement,
            tableTagsStatement: tagsClauseStatement,
        })
    }

    getDualityViewBodyDdl(createViewDto) {
        const body = ['SELECT'];
        const fromRootTableStatement = this._getFromRootTableStatement(createViewDto);
        body.push(fromRootTableStatement + ';');
        return body.join('\n');
    }
}

module.exports = {
    SqlDualityViewDdlCreator,
}
