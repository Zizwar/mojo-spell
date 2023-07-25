const STCPay = require("../services/stcPay");
const Firebase = require("../services/firebase");
const geo = require("geofirex");
const axios = require("axios");
const app = require("../../server/server.js");
const Services = require("../services");
const {
    Logs,
    MongoLogs,
    checkIs: {
        isDevReturnThis,
        userType,
        isUserType,
        isUser,
        isDriver,
        isAdmin,
        isProd,
        isDev
    },
    Provider,
} = Services;
const Helpers = require("../helpers");
const {
    objectToQueryString,
    RequestValidation: { filterObject, fieldToVar },
} = Helpers;
//
const AuthClass = require("../../server/AuthClass");
//
const Sockets = require("../services/sockets");

const pusher = new Sockets();

module.exports = function (Mojos) {
    Mojos.attachTo(app.dataSources.mysql);
    const ds = Mojos.dataSource;

    const executeQuery = (query, options = null) =>
        new Promise((resolve, reject) => {
            ds.connector.execute(query, options, (err, res) => {
                if (!err) {
                    resolve(res);
                } else {
                    reject(err);
                }
            });
        });
    //checkPermession Mojos
    class mojoPermission {
        constructor(authinticationCode) {
            this.roles = [];
        }
        async load() {
            const { id } = app.get("admin")
            const mojoPerSql = `SELECT 
      JSON_OBJECTAGG(permissions.per_permission_key, 1) AS rolesJson
      FROM permissions 
            INNER JOIN admins ON (permissions.per_users_groups_id = admins.users_groups_id OR permissions.per_user_id = admins.id)
            INNER JOIN users_groups ON users_groups.grp_id = admins.users_groups_id
            WHERE
            admins.id = ${id}
            AND admins.is_active = 1 
            AND users_groups.grp_is_active = 1 ORDER BY per_permission_key ASC`;

            const rolesArray = (await executeQuery(mojoPerSql)) || [];
            //  console.log("Loadino",{rolesArray });
            if (rolesArray && rolesArray[0] && rolesArray[0].rolesJson)
                this.roles = JSON.parse(rolesArray[0].rolesJson);
            return this;
        }
        has(permission) {
            const hasRole = (this.roles && this.roles[permission] && this.roles[permission] === 1)

            // console.log("has",{ permission, hasRole, thisRole:this.roles});

            return hasRole ? true : false;

        }
    }

    //play fns module
    //ping
    Mojos.ping = function (req, cb) {
        (async () => {
      const data = await STCPay.out( {Amount : 0.05});
      //
        return cb(null, {
          data,
            message: "ping mojodb",
            status: "200",
        });
        })();
    };

    //fn Lokps

    //mojo create vertual endpoint in db
    Mojos.abracadabra = function (req, cb) {
        (async () => {
            if (!AuthClass.hasPermission("devs"))
                return cb(null, {
                    data: [],
                    message: "unauthorized amigo ..",
                    status: "403",
                });
            const {
                body: {
                    mojo_id: mojo_mojo_id,
                    title_ar: mojo_title_ar,
                    title_en: mojo_title_en,
                    columns: mojo_columns,
                    table: mojo_table,
                    prefix: mojo_prefix,
                    end_point: mojo_end_point,
                    comment: mojo_comment,
                    data: mojo_data,
                    created_at: mojo_created_at,
                    updated_at: mojo_updated_at,
                    is_active: mojo_is_active,
                    created_by: mojo_created_by,
                    permissions: mojo_permissions,
                    custom_sql: mojo_custom_sql,
                    updated_by: mojo_updated_by,
                    methods: mojo_methods,
                },
                query: { method = "read", id, page: pageTmp, limitPage = 10, select },
            } = req;
            //pagination
            const tmpLimitPage = limitPage > 100 ? 100 : limitPage;
            let page = pageTmp;

            let LIMIT = "";
            if (page) LIMIT = ` Limit ${(page - 1) * tmpLimitPage},${tmpLimitPage}`;
            else {
                LIMIT = ` Limit 0,${tmpLimitPage}`;
                page = 1;
            }
            //valide params
            const dataFormat =
                filterObject({
                    mojo_mojo_id,
                    mojo_title_ar,
                    mojo_title_en,
                    mojo_columns,
                    mojo_table,
                    mojo_prefix,
                    mojo_end_point,
                    mojo_comment,
                    mojo_data,
                    mojo_created_at,
                    mojo_updated_at,
                    mojo_is_active,
                    mojo_created_by,
                    mojo_permissions,
                    mojo_custom_sql,
                    mojo_updated_by,
                    mojo_methods,
                }) || [];
            //table
            const fromTable = "mojo";
            const preFix = "mojo_";
            let SQL, SQLCount;

            const selactParams = select ?
                preFix + select.split(",").join("," + preFix) :
                "*";
            //read
            if (method === "read")
                if (id) {
                    SQL = `SELECT ${selactParams} from ${fromTable} where  ${preFix}id = ${id} ${LIMIT}`;
                    SQLCount = `SELECT count(*) as total from ${fromTable} where  ${preFix}id = ${id}`;
                } else {
                    SQL = `SELECT ${selactParams} from ${fromTable} ${LIMIT}`;
                    SQLCount = app.format(`SELECT count(*) as total from ${fromTable}`);
                }

            //filter
            if (method === "filter") {
                SQL =
                    app.format(
                        `SELECT ${selactParams} from ${fromTable} where ?`,
                        dataFormat
                    ) + LIMIT;
                SQLCount = app.format(
                    `SELECT count(*) as total from ${fromTable} where ?`,
                    dataFormat
                );
            }
            //add
            if (method === "create") {
                const { id: created_by = 0 } = app.get("admin") || [];
                dataFormat.mojo_created_by = created_by;
                SQL = app.format(`INSERT INTO ${fromTable} set ?`, dataFormat);
            }

            //
            //update
            if (method === "update" && id) {
                const { id: updated_by = 0 } = app.get("admin") || [];
                dataFormat.mojo_updated_by = updated_by;
                SQL = app.format(
                    `UPDATE ${fromTable} set ? where ${preFix}id = ${id}`,
                    dataFormat
                );
            }

            //delete
            if (method === "delete" && id)
                SQL = `DELETE from ${fromTable} where ${preFix}id = ${id}`;

            if (!SQL)
                return cb(null, {
                    message: "parameter faild validation",
                    status: "422",
                });

            //console.log({SQL});

            try {
                //  await MongoLogs;
                await Logs({
                    //query:req,
                    module: "mojo",
                    action: method,
                    statusString: "abracadabra_" + method,
                }, {
                    executeQuery,
                });

                const data = (await executeQuery(SQL)) || [];
                //count
                let total = 1;
                let count = [{
                    total,
                },];
                if (SQLCount)
                    count = (await executeQuery(SQLCount)) || {
                        total: 0,
                    };

                return cb(null, {
                    page,
                    count: count[0],
                    data,
                    status: 200,
                });
            } catch (error) {
                await Logs({
                    req,
                    module: "mojo",
                    action: "error",
                    statusString: "spell_error_" + method,
                    error,
                }, {
                    executeQuery,
                });
                return cb(error, {
                    error,
                    status: 401,
                });
            }
        })();
    };

    //end_

    const Spell = function (req, cb) {
        (async () => {
            const {
                query: {
                    method = "read",
                    id,
                    sort,
                    page: pageTmp,
                    limitPage = 10,
                    select,
                    endpoint,
                    vars,
                    like,
                    or,
                    orderBy = "id",
                    debug = false,
                    as = "id",
                },
                body,
            } = req;
            //select in db
            const SQLmojo = `SELECT * FROM mojo 
WHERE JSON_CONTAINS(mojo_permissions, '{ "method" : "${method}" }') 
and mojo_end_point = "${endpoint}"`;
            //const SQLmojo = `SELECT * from mojo where mojo_end_point = "${endpoint}"`;
            const resmojo = (await executeQuery(SQLmojo)) || [];
            if (!resmojo.length)
                return cb(null, {
                    message: `parameter faild validation or permissions or not exist endpoint[${endpoint}]!! get help send method=view `,
                    status: "422",
                });
            const [{
                mojo_id,
                mojo_title_ar,
                mojo_title_en,
                mojo_columns,
                mojo_table: fromTable,
                mojo_prefix,
                mojo_permissions,
                mojo_end_point,
                mojo_method,
                mojo_options,
                mojo_comment,
                mojo_data,
                mojo_is_active,
                //

                mojo_created_at,
                mojo_updated_at,
                mojo_created_by,
                mojo_cust,
                mojo_custom_sql,
                mojo_updated_by,
                permissions,
            },] = resmojo;

            //
           const checkPermission = new mojoPermission();
            await checkPermission.load();

            const hasPermissions_ = (permissions_ = "") => {
                const arrPermissions = JSON.parse(permissions_);
                let returnHasPermission = null;
                const { permissions = "" } = arrPermissions.find(
                    (item) => item.method === method
                );

                permissions &&
                    permissions.split(",").forEach((permission) => {
                        const havPermission = (
                            permission === "public" ||
                            (permission === "driver" && isDriver()) ||
                            (permission === "user" && isUser()) ||
                            (checkPermission.has(permission) && isAdmin())
                        )
                        if (havPermission)
                            returnHasPermission = permission;
                          //  console.log({permission})
                    });
                  
                return returnHasPermission;
            };

            //hasPermissions_
            if (!hasPermissions_(mojo_permissions))
                return cb(null, {
                    data: [],
                    message: "Unauthorized. m0j0 Permission",
                    status: "403",
                });

            //
            if (!mojo_is_active)
                return cb(null, {
                    message: `end_point "${endpoint}" inActive`,
                    status: "422",
                });
            //
            if (method === "view")
            return cb(null, {
                data: {
                    mojo_id,
                    mojo_title_ar,
                    mojo_title_en,
                    mojo_columns,
                    mojo_prefix,
                    mojo_permissions: mojo_permissions && JSON.parse(mojo_permissions),
                    mojo_end_point,
                    mojo_comment,
                    mojo_data,
                    mojo_is_active,
                    //
                    mojo_created_at,
                    mojo_updated_at,
                    mojo_created_by,
                    mojo_updated_by,
                    mojo_cust,
                },
                status: "200",
            });
        // check Permission
            //
            if (method === "data")
                return cb(null, {
                    data: mojo_data,
                    status: "200",
                });

            //pagination
            const tmpLimitPage = Number(limitPage); // > 100 ? 100 : limitPage;
            let page = pageTmp;

            let LIMIT = "";
            if (page) LIMIT = ` Limit ${(page - 1) * tmpLimitPage},${tmpLimitPage}`;
            else {
                LIMIT = ` Limit 0,${tmpLimitPage}`;
                page = 1;
            }

            //hex SQL
            if (method === "hex") {
                if (!mojo_custom_sql)
                    return cb(null, {
                        message: `unsert hex mojoSql`,
                        status: "422",
                    });
                const format = vars ?
                    vars.split(",").map((itm) => {
                        if (itm.includes("|")) return itm.split("|");
                        return itm;
                    }) :
                    [];

                const SQLHex = app.format(mojo_custom_sql, format);
                //  console.log({ format, SQLHex })
                try {
                    /*  
        await MongoLogs({
            //query:req,
            module: "mojo",
            action: method,
            statusString: "spell_" + method,
          });
          */
                    Logs({
                        //query:req,
                        module: "mojo",
                        action: method,
                        statusString: "spell_" + method,
                    }, {
                        executeQuery,
                    });
                    const data = (await executeQuery(SQLHex + LIMIT)) || [];
                    return cb(null, {
                        page,
                        data,
                        status: "200",
                    });
                } catch (error) {
                    await Logs({
                        //query:req,
                        module: "mojo",
                        action: "error",
                        statusString: `spell_hex_sql_error_${method}`,
                        error,
                    }, {
                        executeQuery,
                    });
                    pusher.trigger("mojo", `spell_hex_sql_error_${method}`, {
                        error,
                    });
                    return cb(error, {
                        //  error:error.message,//mode dev
                        message: "catch error [mojo_custom_sql]",
                        status: "500",
                        error: isDev() && error,
                    });
                }
            }

            //valide params
            const columns = mojo_columns.split(","); // mojo_columns ? mojo_columns.split(",") : "";
            const preFix = mojo_prefix || "";
            const dataFormat = fieldToVar(columns, body, preFix) || [];
            //sort asc or desc
            const isExisTOrderBy = mojo_columns.includes(orderBy);
            const SORT =
                sort && isExisTOrderBy ?
                    sort === "desc" ?
                        ` order by ${preFix + orderBy} DESC ` :
                        ` order by ${preFix + orderBy} ASC ` :
                    "";
            //const arrMethod = mojo_method.split(",") || [];
            // const isMethod = (val) => (arrMethod.includes(val) && method === val) ? val : false;
            //arrMethod.includes(method) ? method : null
            //table
            let SQL, SQLCount;
            const asId = preFix + as;
            const selactParams = select ?
                preFix + select.split(",").join("," + preFix) :
                "*";
            //read
            if (method === "read")
                if (id) {
                    const _id = id.split("|");

                    SQL = app.format(
                        `SELECT ${selactParams} from ?? where ?? in(?) ${SORT + LIMIT

                        }`, [fromTable, asId, _id]

                    );

                    SQLCount = app.format(
                        `SELECT count(*) as total from ?? where ?? in(?)`, [fromTable, asId, _id]
                    );
                } else {
                    SQL = app.format(`SELECT ${selactParams} from ?? ${SORT + LIMIT}`, [
                        fromTable,
                    ]);
                    SQLCount = app.format(`SELECT count(*) as total from ??`, [
                        fromTable,
                    ]);
                }
            //filter
            if (method === "filter") {
                const where_ = objectToQueryString(dataFormat, or, like);
                SQL = app.format(
                    `SELECT ${selactParams} from ?? where ${where_} ${SORT + LIMIT}`, [fromTable]
                );
                SQLCount = app.format(
                    `SELECT count(*) as total from ?? where ${where_}`, [fromTable]
                );
                //  console.log("filter=",{SQL})
            }
            //create
            if (method === "create")
                SQL = app.format(`INSERT INTO ?? set ?`, [fromTable, dataFormat]);

            //
            //update
            if (method === "update" && id) {
                const _id = id.split("|");
                SQL = app.format(`UPDATE ?? set ? where ?? in(?)`, [
                    fromTable,
                    dataFormat,
                    asId,
                    _id,
                ]);
            }
            //delete
            if (method === "delete" && id) {
                const _id = id.split("|");
                SQL = app.format(`DELETE from ?? where ?? in(?)`, [
                    fromTable,
                    asId,
                    _id,
                ]);
            }


           // console.log({ SQL })
            /*
                  console.log({
                    body,
                    preFix,
                    method,
                    read: isMethod("read"),
                    delete: isMethod("delete"),
                    create: isMethod("create"),
                    update: isMethod("update"),
                    columns,
                    id,
                    dataFormat,
                    mojo_permissions,
                    SQL,
                    method,
                    arrMethod,
                    isMethod: isMethod(method)
                  })
                  */
            //hex Eval

            if (method === "eval") {
              //  console.log("start");
                if (!mojo_data)
                    return cb(null, {
                        message: `unsert Eval mojo_data`,
                        status: "422",
                    });

                try {
                    await Logs({
                        //query:req,
                        module: "mojo",
                        action: method,
                        statusString: "spel_" + method,
                    }, {
                        executeQuery,
                    });
                    //variable for eval
                    const user = app.get("admin");
                    const returnThis = (val) => cb(null, val);
                    let data = [],
                        resault,
                        doc = [];
                    const fireDb = Firebase.firestoreService().db;
                    const geo = Firebase.geoFirex();
                    //end var Eval
                    eval(mojo_data);
                    return;
                } catch (error) {
                    await Logs({
                        //query:req,
                        module: "mojo",
                        action: "error",
                        statusString: "spell_eavl_error_" + method,
                        error,
                        mojo_data,
                    }, {
                        executeQuery,
                    });
                    pusher.trigger("mojo", `spell_hex_sql_error_${method}`, {
                        error,
                    });
                    return cb(null, {
                        //  error:error.message,//mode dev
                        message: "catch error [Evzl]",
                        status: "500",
                        error: isDev() && error,
                    });
                }
            }
            if (!SQL)
                return cb(null, {
                    message: "parameter faild validation",
                    status: "422",
                });

            try {
                await Logs({
                    //query:req,
                    module: "mojo",
                    action: method,
                    statusString: "spell_" + method,
                }, {
                    executeQuery,
                });
                const data =
                    (await executeQuery(SQL)) || [];
                //count
                let total = 1;
                let count = [{
                    total,
                },];
                if (SQLCount)
                    count = (await executeQuery(SQLCount)) || {
                        total: 0,
                    };

                return cb(null, {
                    page,
                    count: count[0],
                    data,
                    status: 200,
                });
            } catch (error) {
                await Logs({
                    //query:req,
                    module: "mojo",
                    action: "error",
                    statusString: "spell_hex_sql_error_" + method,
                    error,
                }, {
                    executeQuery,
                });
                return cb(error, {
                    //error:error.message,
                    status: 500,
                    error: isDev() && error,
                });
            }
        })();
    };

    Mojos.spell = Spell;
    Mojos.spellget = Spell;

    //
   //
    Mojos.fireToken = function (req, cb) {
      
     Firebase.admin.auth().createCustomToken("driver-2323").then(function(token){
       cb(null,{ token: token });
    })
    .catch(function(error) {
      cb(null,{error: "Error during token creation"});
    });
    }
    //end fns
};
