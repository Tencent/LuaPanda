
export class Tools {
    public static genUnifiedPath(path) {
        //全部使用 /
        path = path.replace(/\\/g, '/');
        while(path.match(/\/\//)){
            path = path.replace(/\/\//g, '/');
        }
        //win盘符小写
        path = path.replace(/^\w:/, function($1){return $1.toLocaleLowerCase()});
        return path;
    }
}
