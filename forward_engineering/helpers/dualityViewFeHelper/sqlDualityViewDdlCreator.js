const {AbstractDualityViewFeDdlCreator} = require('./abstractDualityViewDdlCreator');


class SqlDualityViewDdlCreator extends AbstractDualityViewFeDdlCreator {


    convertDualityViewToDdl(view) {
        return '';
    }
}

module.exports = {
    SqlDualityViewDdlCreator,
}
