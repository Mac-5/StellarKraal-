const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * AppraisalConfig
 *
 * Backs the collateral appraisal model so administrators can update base
 * values, depreciation rates, and LTV ratios per livestock type at runtime
 * without a code deployment.
 *
 * Active loans snapshot their collateral values at origination, so updating
 * a row here never retroactively alters existing loan collateral values.
 */
const AppraisalConfig = sequelize.define(
  'AppraisalConfig',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    animalType: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'animal_type',
      validate: {
        notEmpty: true,
      },
    },
    baseValue: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      field: 'base_value',
      validate: {
        min: 0,
      },
    },
    depreciationRate: {
      type: DataTypes.DECIMAL(6, 4),
      allowNull: false,
      field: 'depreciation_rate',
      validate: {
        min: 0,
        max: 1,
      },
    },
    ltvRatio: {
      type: DataTypes.DECIMAL(6, 4),
      allowNull: false,
      field: 'ltv_ratio',
      validate: {
        min: 0,
        max: 1,
      },
    },
    updatedBy: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'updated_by',
    },
  },
  {
    tableName: 'appraisal_config',
    underscored: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['animal_type'],
      },
    ],
  }
);

module.exports = AppraisalConfig;
