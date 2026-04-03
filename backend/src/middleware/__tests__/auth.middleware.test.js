import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const loadAuthMiddleware = async ({
  verifyTokenImpl,
  findByIdImpl,
} = {}) => {
  class TokenExpiredError extends Error {
    constructor(message, expiredAt) {
      super(message);
      this.name = 'TokenExpiredError';
      this.expiredAt = expiredAt;
    }
  }

  class JsonWebTokenError extends Error {
    constructor(message) {
      super(message);
      this.name = 'JsonWebTokenError';
    }
  }

  const jwtMock = {
    TokenExpiredError,
    JsonWebTokenError,
  };

  const verifyToken = verifyTokenImpl ?? jest.fn();
  const User = {
    findById: findByIdImpl ?? jest.fn(),
  };

  jest.unstable_mockModule('jsonwebtoken', () => ({
    default: jwtMock,
  }));

  jest.unstable_mockModule('../../utils/jwt.js', () => ({
    verifyToken,
  }));

  jest.unstable_mockModule('../../models/User.js', () => ({
    default: User,
  }));

  const middleware = await import('../auth.js');

  return {
    ...middleware,
    mocks: {
      jwtMock,
      verifyToken,
      User,
    },
  };
};

describe('auth middleware protect', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_AUTH_021 rejects missing token', async () => {
    const { protect } = await loadAuthMiddleware();

    const req = {
      headers: {},
    };
    const res = {};
    const next = jest.fn();

    await protect(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Not authorized. Missing token.',
      })
    );
  });

  it('TC_AUTH_022 rejects expired token', async () => {
    const { protect, mocks } = await loadAuthMiddleware();

    mocks.verifyToken.mockImplementation(() => {
      throw new mocks.jwtMock.TokenExpiredError('jwt expired', new Date());
    });

    const req = {
      headers: {
        authorization: 'Bearer expired-token',
      },
    };
    const res = {};
    const next = jest.fn();

    await protect(req, res, next);

    expect(mocks.verifyToken).toHaveBeenCalledWith('expired-token');
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Session expired. Please log in again.',
      })
    );
  });

  it('TC_AUTH_023 rejects invalid token', async () => {
    const { protect, mocks } = await loadAuthMiddleware();

    mocks.verifyToken.mockImplementation(() => {
      throw new mocks.jwtMock.JsonWebTokenError('invalid token');
    });

    const req = {
      headers: {
        authorization: 'Bearer invalid-token',
      },
    };
    const res = {};
    const next = jest.fn();

    await protect(req, res, next);

    expect(mocks.verifyToken).toHaveBeenCalledWith('invalid-token');
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Invalid session token. Please log in again.',
      })
    );
  });

  it('TC_AUTH_024 rejects when decoded user does not exist', async () => {
    const { protect, mocks } = await loadAuthMiddleware({
      verifyTokenImpl: jest.fn(() => ({ userId: 'missing-user-id' })),
      findByIdImpl: jest.fn().mockResolvedValue(null),
    });

    const req = {
      headers: {
        authorization: 'Bearer valid-but-user-missing',
      },
    };
    const res = {};
    const next = jest.fn();

    await protect(req, res, next);

    expect(mocks.verifyToken).toHaveBeenCalledWith('valid-but-user-missing');
    expect(mocks.User.findById).toHaveBeenCalledWith('missing-user-id');
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'User not found.',
      })
    );
  });

  it('TC_AUTH_025 attaches req.user and calls next for valid token', async () => {
    const foundUser = {
      _id: 'user-1',
      name: 'Aayan',
      email: 'aayan@example.com',
    };

    const { protect, mocks } = await loadAuthMiddleware({
      verifyTokenImpl: jest.fn(() => ({ userId: 'user-1' })),
      findByIdImpl: jest.fn().mockResolvedValue(foundUser),
    });

    const req = {
      headers: {
        authorization: 'Bearer valid-token',
      },
    };
    const res = {};
    const next = jest.fn();

    await protect(req, res, next);

    expect(mocks.verifyToken).toHaveBeenCalledWith('valid-token');
    expect(mocks.User.findById).toHaveBeenCalledWith('user-1');
    expect(req.user).toEqual(foundUser);
    expect(next).toHaveBeenCalledWith();
  });
});