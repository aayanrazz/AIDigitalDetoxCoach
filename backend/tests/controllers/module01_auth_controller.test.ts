import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const userModelUrl = pathToFileURL(
  path.resolve(__dirname, '../../src/models/User.js')
).href;

const userSettingsModelUrl = pathToFileURL(
  path.resolve(__dirname, '../../src/models/UserSettings.js')
).href;

const notificationModelUrl = pathToFileURL(
  path.resolve(__dirname, '../../src/models/Notification.js')
).href;

const jwtUtilUrl = pathToFileURL(
  path.resolve(__dirname, '../../src/utils/jwt.js')
).href;

const serializeUtilUrl = pathToFileURL(
  path.resolve(__dirname, '../../src/utils/serialize.js')
).href;

const authControllerUrl = pathToFileURL(
  path.resolve(__dirname, '../../src/controllers/auth.controller.js')
).href;

const mockUserFindOne: any = jest.fn();
const mockUserCreate: any = jest.fn();
const mockSettingsCreate: any = jest.fn();
const mockSettingsFindOne: any = jest.fn();
const mockNotificationCreate: any = jest.fn();
const mockHash: any = jest.fn();
const mockCompare: any = jest.fn();
const mockGenerateToken: any = jest.fn(() => 'jwt-token');
const mockSerializeUser: any = jest.fn((user: any) => ({
  _id: user._id,
  id: user._id,
  name: user.name,
  email: user.email,
}));

await jest.unstable_mockModule(userModelUrl, () => ({
  default: {
    findOne: mockUserFindOne,
    create: mockUserCreate,
  },
}));

await jest.unstable_mockModule(userSettingsModelUrl, () => ({
  default: {
    create: mockSettingsCreate,
    findOne: mockSettingsFindOne,
  },
}));

await jest.unstable_mockModule(notificationModelUrl, () => ({
  default: {
    create: mockNotificationCreate,
  },
}));

await jest.unstable_mockModule('bcryptjs', () => ({
  default: {
    hash: mockHash,
    compare: mockCompare,
  },
  hash: mockHash,
  compare: mockCompare,
}));

await jest.unstable_mockModule(jwtUtilUrl, () => ({
  generateToken: mockGenerateToken,
}));

await jest.unstable_mockModule(serializeUtilUrl, () => ({
  serializeUser: mockSerializeUser,
}));

const { register, login, getMe } = await import(authControllerUrl);

type MockResponse = {
  statusCode: number;
  body: any;
  status: (code: number) => MockResponse;
  json: (payload: any) => MockResponse;
};

type ApiErrorLike = {
  message: string;
  statusCode: number;
};

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
}

function getNextError(next: any): ApiErrorLike {
  return next.mock.calls[0][0] as ApiErrorLike;
}

describe('Module 1 - auth.controller.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateToken.mockReturnValue('jwt-token');
    mockSerializeUser.mockImplementation((user: any) => ({
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
    }));
  });

  it('TC_AUTH_CTRL_001 - register rejects when required fields are missing', async () => {
    const req = { body: {} } as any;
    const res = createMockResponse();
    const next: any = jest.fn();

    await register(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Name, email, and password are required.');
    expect(error.statusCode).toBe(400);
  });

  it('TC_AUTH_CTRL_002 - register rejects when password is shorter than 8 characters', async () => {
    const req = {
      body: {
        name: 'Aayan',
        email: 'aayan@example.com',
        password: '12345',
      },
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await register(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Password must be at least 8 characters.');
    expect(error.statusCode).toBe(400);
  });

  it('TC_AUTH_CTRL_003 - register rejects duplicate email', async () => {
    mockUserFindOne.mockImplementationOnce(async () => ({
      _id: 'existing-user-id',
      email: 'aayan@example.com',
    }));

    const req = {
      body: {
        name: 'Aayan',
        email: 'aayan@example.com',
        password: 'password123',
      },
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await register(req, res as any, next);

    expect(mockUserFindOne).toHaveBeenCalledWith({
      email: 'aayan@example.com',
    });

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Email already exists.');
    expect(error.statusCode).toBe(409);
  });

  it('TC_AUTH_CTRL_004 - register creates user, settings, notification, and returns token', async () => {
    mockUserFindOne.mockImplementationOnce(async () => null);
    mockHash.mockImplementationOnce(async () => 'hashed-password');

    mockUserCreate.mockImplementationOnce(async () => ({
      _id: 'user-001',
      name: 'Aayan',
      email: 'aayan@example.com',
    }));

    mockSettingsCreate.mockImplementationOnce(async () => ({
      _id: 'settings-001',
      user: 'user-001',
    }));

    mockNotificationCreate.mockImplementationOnce(async () => ({
      _id: 'notification-001',
    }));

    const req = {
      body: {
        name: '  Aayan  ',
        email: '  AAYAN@example.com  ',
        password: 'password123',
      },
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await register(req, res as any, next);

    expect(mockUserFindOne).toHaveBeenCalledWith({
      email: 'aayan@example.com',
    });

    expect(mockHash).toHaveBeenCalledWith('password123', 10);

    expect(mockUserCreate).toHaveBeenCalledWith({
      name: 'Aayan',
      email: 'aayan@example.com',
      passwordHash: 'hashed-password',
    });

    expect(mockSettingsCreate).toHaveBeenCalledWith({
      user: 'user-001',
    });

    expect(mockNotificationCreate).toHaveBeenCalledWith({
      user: 'user-001',
      type: 'system',
      title: 'Welcome to Digital Detox Coach',
      body: 'Complete your profile setup to generate your first detox plan.',
      cta: {
        label: 'SET GOALS',
        action: 'open_profile_setup',
      },
    });

    expect(mockGenerateToken).toHaveBeenCalledWith('user-001');
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      success: true,
      message: 'Account created successfully.',
      token: 'jwt-token',
      user: {
        _id: 'user-001',
        id: 'user-001',
        name: 'Aayan',
        email: 'aayan@example.com',
      },
      settings: {
        _id: 'settings-001',
        user: 'user-001',
      },
    });
  });

  it('TC_AUTH_CTRL_005 - login rejects when email or password is missing', async () => {
    const req = { body: {} } as any;
    const res = createMockResponse();
    const next: any = jest.fn();

    await login(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Email and password are required.');
    expect(error.statusCode).toBe(400);
  });

  it('TC_AUTH_CTRL_006 - login rejects when user is not found', async () => {
    const mockSelect: any = jest.fn();
    mockSelect.mockImplementationOnce(async () => null);

    mockUserFindOne.mockImplementationOnce(() => ({
      select: mockSelect,
    }));

    const req = {
      body: {
        email: 'unknown@example.com',
        password: 'password123',
      },
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await login(req, res as any, next);

    expect(mockUserFindOne).toHaveBeenCalledWith({
      email: 'unknown@example.com',
    });
    expect(mockSelect).toHaveBeenCalledWith('+passwordHash');

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Invalid email or password.');
    expect(error.statusCode).toBe(401);
  });

  it('TC_AUTH_CTRL_007 - login rejects when password does not match', async () => {
    const mockSave: any = jest.fn();

    const mockUser = {
      _id: 'user-001',
      name: 'Aayan',
      email: 'aayan@example.com',
      passwordHash: 'hashed-password',
      save: mockSave,
    };

    const mockSelect: any = jest.fn();
    mockSelect.mockImplementationOnce(async () => mockUser);

    mockUserFindOne.mockImplementationOnce(() => ({
      select: mockSelect,
    }));

    mockCompare.mockImplementationOnce(async () => false);

    const req = {
      body: {
        email: 'aayan@example.com',
        password: 'wrong-password',
      },
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await login(req, res as any, next);

    expect(mockCompare).toHaveBeenCalledWith(
      'wrong-password',
      'hashed-password'
    );
    expect(mockSave).not.toHaveBeenCalled();

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Invalid email or password.');
    expect(error.statusCode).toBe(401);
  });

  it('TC_AUTH_CTRL_008 - login succeeds, updates lastLoginAt, and returns token with settings', async () => {
    const mockSave: any = jest.fn();
    mockSave.mockImplementationOnce(async () => true);

    const mockUser = {
      _id: 'user-001',
      name: 'Aayan',
      email: 'aayan@example.com',
      passwordHash: 'hashed-password',
      save: mockSave,
      lastLoginAt: null as Date | null,
    };

    const mockSelect: any = jest.fn();
    mockSelect.mockImplementationOnce(async () => mockUser);

    mockUserFindOne.mockImplementationOnce(() => ({
      select: mockSelect,
    }));

    mockCompare.mockImplementationOnce(async () => true);

    mockSettingsFindOne.mockImplementationOnce(async () => ({
      _id: 'settings-001',
      user: 'user-001',
      dailyLimitMinutes: 180,
    }));

    const req = {
      body: {
        email: '  AAYAN@example.com  ',
        password: 'password123',
      },
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await login(req, res as any, next);

    expect(mockUserFindOne).toHaveBeenCalledWith({
      email: 'aayan@example.com',
    });
    expect(mockCompare).toHaveBeenCalledWith(
      'password123',
      'hashed-password'
    );
    expect(mockSettingsFindOne).toHaveBeenCalledWith({
      user: 'user-001',
    });
    expect(mockUser.lastLoginAt).toBeInstanceOf(Date);
    expect(mockSave).toHaveBeenCalled();
    expect(mockGenerateToken).toHaveBeenCalledWith('user-001');

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Login successful.',
      token: 'jwt-token',
      user: {
        _id: 'user-001',
        id: 'user-001',
        name: 'Aayan',
        email: 'aayan@example.com',
      },
      settings: {
        _id: 'settings-001',
        user: 'user-001',
        dailyLimitMinutes: 180,
      },
    });
  });

  it('TC_AUTH_CTRL_009 - getMe returns current authenticated user with settings', async () => {
    mockSettingsFindOne.mockImplementationOnce(async () => ({
      _id: 'settings-001',
      user: 'user-001',
      dailyLimitMinutes: 180,
    }));

    const req = {
      user: {
        _id: 'user-001',
        name: 'Aayan',
        email: 'aayan@example.com',
      },
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await getMe(req, res as any, next);

    expect(mockSettingsFindOne).toHaveBeenCalledWith({
      user: 'user-001',
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      user: {
        _id: 'user-001',
        id: 'user-001',
        name: 'Aayan',
        email: 'aayan@example.com',
      },
      settings: {
        _id: 'settings-001',
        user: 'user-001',
        dailyLimitMinutes: 180,
      },
    });
  });
});