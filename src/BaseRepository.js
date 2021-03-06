class BaseRepository {
  constructor ({ sequelizeModel, mapper }) {
    Object.assign(
      this,
      {
        sequelizeModel,
        mapper,
        sequelize: sequelizeModel && sequelizeModel.sequelize,
        queryInterface: sequelizeModel && sequelizeModel.sequelize.getQueryInterface(),
        findOneBy: this.findOneBy.bind(this),
        findOneById: this.findOneById.bind(this),
        findOneByCriterias: this.findOneByCriterias.bind(this),
        findAllBy: this.findAllBy.bind(this),
        findAllByCriterias: this.findAllByCriterias.bind(this),

        countByCriterias: this.countByCriterias.bind(this),

        save: this.save.bind(this),
        update: this.update.bind(this),
        upsert: this.upsert.bind(this),
        updateFields: this.updateFields.bind(this),
        updateByDiff: this.updateByDiff.bind(this),

        delete: this.delete.bind(this),
        deleteAllByCriterias: this.deleteAllByCriterias.bind(this)
      }
    )

    if (sequelizeModel && sequelizeModel.primaryKeys) {
      this.primaryKey = Object.keys(sequelizeModel.primaryKeys)[0]
    }
  }

  hasPrimaryKeyFilled (entityInstance) {
    return entityInstance && this.primaryKey && entityInstance[this.primaryKey]
  }

  async save (entityInstance) {
    const { sequelizeModel, mapper } = this

    const buildParameters = {
      isNewRecord: !this.hasPrimaryKeyFilled(entityInstance)
    }

    const sequelizeResult = await sequelizeModel.build(mapper.toDatabase(entityInstance), buildParameters).save()
    return this.assignEntityToSequelizeResult(entityInstance, sequelizeResult)
  }

  assignEntityToSequelizeResult (entity, sequelizeResult) {
    const mappedResult = this.mapper.toEntity(sequelizeResult)

    const autoGeneratedFields = [this.primaryKey, 'createdAt', 'updatedAt']
    const autoGeneratedValues = autoGeneratedFields
      .filter(field => mappedResult[field])
      .reduce((values, field) => Object.assign(values, {[field]: mappedResult[field]}), {})

    const assignedValues = Object.assign({}, mappedResult, entity, autoGeneratedValues)
    return this.mapper.createEntity(assignedValues, true)
  }

  updateFields (entityInstance, newFields, relationshipFields = {}, whereFields = []) {
    const fieldsToChange = Object.keys(newFields)

    Object.assign(entityInstance, newFields)

    return this.update(entityInstance, fieldsToChange, relationshipFields, whereFields)
  }

  update (entityInstance, fields, relationshipFields = {}, whereFields = []) {
    const { sequelizeModel, mapper } = this

    const entityFieldValues = fields.reduce((all, field) =>
      Object.assign(all, { [field]: this.resolveNullField(entityInstance[field]) }), {})

    const columnValues = Object.assign({}, this.setNullFields(mapper.toDatabase(entityFieldValues)), relationshipFields)

    const entityKeyValues = {
      [this.primaryKey]: entityInstance[this.primaryKey]
    }

    whereFields.forEach((field) => Object.assign(entityKeyValues, { [field]: entityInstance[field] }))

    const constraints = {
      where: mapper.toDatabase(entityKeyValues),
      fields: Object.keys(columnValues)
    }

    return sequelizeModel
      .update(columnValues, constraints)
      .then(() => entityInstance)
  }

  upsert (insertValues, updateValues, where) {
    const { sequelizeModel } = this
    return this.queryInterface.upsert(sequelizeModel.tableName, insertValues, updateValues, where, sequelizeModel, {})
  }

  updateByDiff (originalEntity, updatedEntity, relationshipFields) {
    const fields = Object.keys(originalEntity)
      .filter((key) => {
        const originalValue = originalEntity[key]
        const updatedlValue = updatedEntity[key]

        return originalValue !== updatedlValue
      })

    if (!fields.length) return Promise.resolve(originalEntity)

    return this.update(updatedEntity, fields, relationshipFields)
  }

  delete (entityInstance, options = null) {
    const { sequelizeModel, mapper } = this

    const buildParameters = {
      isNewRecord: !this.hasPrimaryKeyFilled(entityInstance)
    }

    return sequelizeModel
      .build(mapper.toDatabase(entityInstance), buildParameters)
      .destroy(options)
  }

  deleteAllByCriterias (where, options = {}) {
    return this.sequelizeModel.destroy(Object.assign(options, { where }))
  }

  resolveNullField (value) {
    if (value === null || value === undefined) {
      return 'NULL'
    }

    return value
  }

  setNullFields (object) {
    Object.keys(object).forEach((key) => {
      if (object[key] === 'NULL') {
        object[key] = null
      }
    })

    return object
  }

  findOneBy (options) {
    return this.sequelizeModel.findOne(options).then(this.mapper.toEntity)
  }

  findOneById (id) {
    return this.findOneBy({
      where: {
        [this.primaryKey]: id
      },
      raw: true
    })
  }

  findOneByCriterias (where) {
    return this.findOneBy({ where, raw: true })
  }

  findAllBy (options) {
    return this.sequelizeModel.findAll(options).then(this.mapper.toEntity)
  }

  findAllByCriterias (where, options = {}) {
    const { paranoid = true } = options
    return this.findAllBy({ where, raw: true, paranoid })
  }

  countByCriterias (where) {
    return this.sequelizeModel.count({ where })
  }
}

module.exports = {
  for (sequelizeModel, mapper, composition = {}) {
    const baseRepository = new BaseRepository({ sequelizeModel, mapper })

    const boundMethods = Object.keys(composition).reduce((newMethods, methodName) => {
      newMethods[methodName] = composition[methodName].bind(baseRepository)
      return newMethods
    }, {})

    return Object.assign(baseRepository, boundMethods)
  }
}
