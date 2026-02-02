/*
  Sequelize modeli za MySQL bazu podataka
 */

require('dotenv').config();

const { Sequelize, DataTypes } = require('sequelize');

// Konfiguracija baze podataka
const sequelize = new Sequelize(
  process.env.DB_NAME || 'wt26',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || 'password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  dialect: 'mysql',
  logging: process.env.NODE_ENV === 'test' ? false : console.log,
  }
);


// MODEL: Scenario
const Scenario = sequelize.define('Scenario', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Neimenovani scenarij',
  },
}, {
  tableName: 'Scenario',
  timestamps: false,
});


// MODEL: Line

const Line = sequelize.define('Line', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  lineId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '',
  },
  nextLineId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  scenarioId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Scenario,
      key: 'id',
    },
  },
}, {
  tableName: 'Line',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['scenarioId', 'lineId'],
      name: 'unique_line_per_scenario',
    },
  ],
});

// MODEL: Delta

const Delta = sequelize.define('Delta', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  scenarioId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Scenario,
      key: 'id',
    },
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['line_update', 'char_rename']],
    },
  },
  lineId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    // Koristi se za "line_update"
  },
  nextLineId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    // Koristi se za "line_update"
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
    // Novi tekst linije (samo za "line_update")
  },
  oldName: {
    type: DataTypes.STRING,
    allowNull: true,
    // Staro ime lika (samo za "char_rename")
  },
  newName: {
    type: DataTypes.STRING,
    allowNull: true,
    // Novo ime lika (samo za "char_rename")
  },
  timestamp: {
    type: DataTypes.INTEGER,
    allowNull: false,
    // Unix vrijeme promjene u sekundama
  },
}, {
  tableName: 'Delta',
  timestamps: false,
});


// MODEL: Checkpoint

const Checkpoint = sequelize.define('Checkpoint', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  scenarioId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Scenario,
      key: 'id',
    },
  },
  timestamp: {
    type: DataTypes.INTEGER,
    allowNull: false,
    // Unix vrijeme trenutka kreiranja checkpointa
  },
}, {
  tableName: 'Checkpoint',
  timestamps: false,
});

// RELACIJE

// Scenario ima mnogo linija
Scenario.hasMany(Line, { foreignKey: 'scenarioId', onDelete: 'CASCADE' });
Line.belongsTo(Scenario, { foreignKey: 'scenarioId' });

// Scenario ima mnogo delta zapisa
Scenario.hasMany(Delta, { foreignKey: 'scenarioId', onDelete: 'CASCADE' });
Delta.belongsTo(Scenario, { foreignKey: 'scenarioId' });

// Scenario ima mnogo checkpointa
Scenario.hasMany(Checkpoint, { foreignKey: 'scenarioId', onDelete: 'CASCADE' });
Checkpoint.belongsTo(Scenario, { foreignKey: 'scenarioId' });


// MODEL: User

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'user',
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'User',
  timestamps: false,
});

module.exports = {
  sequelize,
  Sequelize,
  Scenario,
  Line,
  Delta,
  Checkpoint,
  User,
};
