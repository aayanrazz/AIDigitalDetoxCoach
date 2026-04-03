import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const loadAuthController = async ({
  userFindOne,
  userCreate,
  userSettingsCreate,
  userSettingsFindOne,
  notificationCreate,
  bcryptHash,
  bcryptCompare,
  generateTokenValue = 'jwt-token',
  serializeUserImpl,
} = {}) => {
  const User = {
    findOne: userFindOne ?? jest.fn(),
    create: userCreate ?? jest.fn(),
  };

  const UserSettings = {
    create: userSettingsCreate ?? jest.fn(),
    findOne: userSettingsFindOne ?? jest.fn(),
  };

  const Notification = {
    create: notificationCreate ?? jest.fn(),
  };

  const bcrypt = {
    hash: bcryptHash ?? jest.fn(),
    compare: bcryptCompare ?? jest.fn(),
  };

  const generateToken = jest.fn().mockReturnValue(generateTokenValue);

  const serializeUser =
    serializeUserImpl ??
    jest.fn(user => ({
      _id: user._id,
      name: user.name,
      email: user.email,
    }));

  jest.unstable_mockModule('../../models/User.js', () => ({
    default: User,
  }));

  jest.unstable_mockModule('../../models/UserSettings.js', () => ({
    default: UserSettings,
  }));

  jest.unstable_mockModule('../../models/Notification.js', () => ({
    default: Notification,
  }));

  jest.unstable_mockModule('bcryptjs', () => ({
    default: bcrypt,
  }));

  jest.unstable_mockModule('../../utils/jwt.js', () => ({
    generateToken,
  }));

  jest.unstable_mockModule('../../utils/serialize.js', () => ({
    serializeUser,
  }));

  const controller = await import('../auth.controller.js');

  return {
    ...controller,
    mocks: {
      User,
      UserSettings,
      Notification,
      bcrypt,
      generateToken,
      serializeUser,
    },
  };
};

describe('auth.controller.js', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_AUTH_012 register rejects missing fields', async () => {
    const { register } = await loadAuthController();

    const req = {
      body: {},
    };
    const res = makeRes();
    const next = jest.fn();

    await register(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Name, email, and password are required.',
      })
    );
  });

  it('TC_AUTH_013 register rejects short password', async () => {
    const { register } = await loadAuthController();

    const req = {
      body: {
        name: 'Aayan',
        email: 'aayan@example.com',
        password: '12345',
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await register(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Password must be at least 8 characters.',
      })
    );
  });

  it('TC_AUTH_014 register rejects duplicate email', async () => {
    const existingUser = {
      _id: 'existing-user-id',
      email: 'aayan@example.com',
    };

    const { register, mocks } = await loadAuthController({
      userFindOne: jest.fn().mockResolvedValue(existingUser),
    });

    const req = {
      body: {
        name: 'Aayan',
        email: 'aayan@example.com',
        password: 'password123',
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await register(req, res, next);

    expect(mocks.User.findOne).toHaveBeenCalledWith({
      email: 'aayan@example.com',
    });

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: 'Email already exists.',
      })
    );
  });

  it('TC_AUTH_015 register success creates user, settings, notification and returns token', async () => {
    const createdUser = {
      _id: 'user-1',
      name: 'Aayan',
      email: 'aayan@example.com',
    };

    const createdSettings = {
      user: 'user-1',
      dailyLimitMinutes: 240,
    };

    const { register, mocks } = await loadAuthController({
      userFindOne: jest.fn().mockResolvedValue(null),
      userCreate: jest.fn().mockResolvedValue(createdUser),
      userSettingsCreate: jest.fn().mockResolvedValue(createdSettings),
      notificationCreate: jest.fn().mockResolvedValue({}),
      bcryptHash: jest.fn().mockResolvedValue('hashed-password'),
    });

    const req = {
      body: {
        name: ' Aayan ',
        email: 'AAYAN@example.com ',
        password: 'password123',
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await register(req, res, next);

    expect(mocks.User.findOne).toHaveBeenCalledWith({
      email: 'aayan@example.com',
    });

    expect(mocks.bcrypt.hash).toHaveBeenCalledWith('password123', 10);

    expect(mocks.User.create).toHaveBeenCalledWith({
      name: 'Aayan',
      email: 'aayan@example.com',
      passwordHash: 'hashed-password',
    });

    expect(mocks.UserSettings.create).toHaveBeenCalledWith({
      user: 'user-1',
    });

    expect(mocks.Notification.create).toHaveBeenCalledWith({
      user: 'user-1',
      type: 'system',
      title: 'Welcome to Digital Detox Coach',
      body: 'Complete your profile setup to generate your first detox plan.',
      cta: {
        label: 'SET GOALS',
        action: 'open_profile_setup',
      },
    });

    expect(mocks.generateToken).toHaveBeenCalledWith('user-1');

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Account created successfully.',
      token: 'jwt-token',
      user: {
        _id: 'user-1',
        name: 'Aayan',
        email: 'aayan@example.com',
      },
      settings: createdSettings,
    });

    expect(next).not.toHaveBeenCalled();
  });

  it('TC_AUTH_016 login rejects missing fields', async () => {
    const { login } = await loadAuthController();

    const req = {
      body: {},
    };
    const res = makeRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Email and password are required.',
      })
    );
  });

  it('TC_AUTH_017 login rejects when user is not found', async () => {
    const select = jest.fn().mockResolvedValue(null);

    const { login, mocks } = await loadAuthController({
      userFindOne: jest.fn(() => ({ select })),
    });

    const req = {
      body: {
        email: 'aayan@example.com',
        password: 'password123',
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(mocks.User.findOne).toHaveBeenCalledWith({
      email: 'aayan@example.com',
    });
    expect(select).toHaveBeenCalledWith('+passwordHash');

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Invalid email or password.',
      })
    );
  });

  it('TC_AUTH_018 login rejects when password does not match', async () => {
    const foundUser = {
      _id: 'user-1',
      name: 'Aayan',
      email: 'aayan@example.com',
      passwordHash: 'hashed-password',
      save: jest.fn(),
    };

    const select = jest.fn().mockResolvedValue(foundUser);

    const { login, mocks } = await loadAuthController({
      userFindOne: jest.fn(() => ({ select })),
      bcryptCompare: jest.fn().mockResolvedValue(false),
    });

    const req = {
      body: {
        email: 'aayan@example.com',
        password: 'wrong-password',
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(mocks.bcrypt.compare).toHaveBeenCalledWith(
      'wrong-password',
      'hashed-password'
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Invalid email or password.',
      })
    );
  });

  it('TC_AUTH_019 login success returns token, serialized user, and settings', async () => {
    const save = jest.fn().mockResolvedValue(undefined);

    const foundUser = {
      _id: 'user-1',
      name: 'Aayan',
      email: 'aayan@example.com',
      passwordHash: 'hashed-password',
      save,
    };

    const settings = {
      user: 'user-1',
      dailyLimitMinutes: 240,
    };

    const select = jest.fn().mockResolvedValue(foundUser);

    const { login, mocks } = await loadAuthController({
      userFindOne: jest.fn(() => ({ select })),
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
      bcryptCompare: jest.fn().mockResolvedValue(true),
    });

    const req = {
      body: {
        email: 'AAYAN@example.com ',
        password: 'password123',
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await login(req, res, next);

    expect(mocks.User.findOne).toHaveBeenCalledWith({
      email: 'aayan@example.com',
    });

    expect(select).toHaveBeenCalledWith('+passwordHash');

    expect(mocks.bcrypt.compare).toHaveBeenCalledWith(
      'password123',
      'hashed-password'
    );

    expect(save).toHaveBeenCalled();

    expect(mocks.UserSettings.findOne).toHaveBeenCalledWith({
      user: 'user-1',
    });

    expect(mocks.generateToken).toHaveBeenCalledWith('user-1');

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Login successful.',
      token: 'jwt-token',
      user: {
        _id: 'user-1',
        name: 'Aayan',
        email: 'aayan@example.com',
      },
      settings,
    });

    expect(next).not.toHaveBeenCalled();
  });

  it('TC_AUTH_020 getMe returns serialized user and settings', async () => {
    const reqUser = {
      _id: 'user-1',
      name: 'Aayan',
      email: 'aayan@example.com',
    };

    const settings = {
      user: 'user-1',
      dailyLimitMinutes: 240,
    };

    const { getMe, mocks } = await loadAuthController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
    });

    const req = {
      user: reqUser,
    };
    const res = makeRes();
    const next = jest.fn();

    await getMe(req, res, next);

    expect(mocks.UserSettings.findOne).toHaveBeenCalledWith({
      user: 'user-1',
    });

    expect(mocks.serializeUser).toHaveBeenCalledWith(reqUser);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      user: {
        _id: 'user-1',
        name: 'Aayan',
        email: 'aayan@example.com',
      },
      settings,
    });

    expect(next).not.toHaveBeenCalled();
  });
});